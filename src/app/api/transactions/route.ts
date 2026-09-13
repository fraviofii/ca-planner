import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateToDay, dayToDate, isValidDay } from "@/lib/dates";
import { badRequest } from "@/lib/http";
import { balanceScope, closingBalances, movementsByDay } from "@/lib/balances";

export const dynamic = "force-dynamic";

const LIMIT = 1000;

/**
 * GET /api/transactions?from=&to=&accountId=&categoryId=(id|none)&q=&transfers=(include|exclude|only)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const accountId = url.searchParams.get("accountId");
  const categoryId = url.searchParams.get("categoryId");
  const q = url.searchParams.get("q")?.trim();
  const transfers = url.searchParams.get("transfers") ?? "include";

  if ((from && !isValidDay(from)) || (to && !isValidDay(to))) return badRequest("Datas devem ser AAAA-MM-DD.");

  const where: Prisma.TransactionWhereInput = {
    account: { ignored: false },
  };
  if (from || to) where.date = { ...(from ? { gte: dayToDate(from) } : {}), ...(to ? { lte: dayToDate(to) } : {}) };
  if (accountId) where.accountId = accountId;
  if (categoryId === "none") where.categoryId = null;
  else if (categoryId) where.categoryId = categoryId;
  if (transfers === "exclude") where.isTransfer = false;
  if (transfers === "only") where.isTransfer = true;
  if (q) {
    where.OR = [{ description: { contains: q } }, { counterparty: { contains: q } }, { notes: { contains: q } }];
  }

  const [rows, count] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: LIMIT,
      include: {
        account: { select: { id: true, name: true, bankName: true } },
        category: { select: { id: true, name: true, group: { select: { id: true, name: true } } } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  let incomeCents = 0;
  let expenseCents = 0;
  for (const r of rows) {
    if (r.isTransfer) continue;
    if (r.amountCents >= 0) incomeCents += r.amountCents;
    else expenseCents += r.amountCents;
  }

  return NextResponse.json({
    transactions: rows.map((r) => ({ ...r, day: dateToDay(r.date), raw: undefined })),
    totals: { incomeCents, expenseCents, netCents: incomeCents + expenseCents, count, shown: rows.length, limit: LIMIT },
    balances: await dayBalances(accountId, rows),
  });
}

/**
 * Saldo no fim de cada dia contábil mostrado — ver src/lib/balances.ts para o método.
 * Devolve null quando alguma conta envolvida não tem saldo conhecido.
 */
async function dayBalances(accountId: string | null, rows: Array<{ date: Date }>) {
  if (!rows.length) return null;
  const scope = await balanceScope(accountId);
  if (!scope) return null;

  // rows vem em ordem decrescente: a última linha é o dia mais antigo da tela.
  const movements = await movementsByDay(scope.accountIds, dateToDay(rows[rows.length - 1].date));
  return { byDay: closingBalances(scope.anchorCents, movements), accountCount: scope.accountCount };
}
