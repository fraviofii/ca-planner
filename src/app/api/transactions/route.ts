import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateToDay } from "@/lib/dates";
import { badRequest } from "@/lib/http";
import { parseTransactionFilters, transactionWhere } from "@/lib/transaction-filters";
import { balanceScope, closingBalances, movementsByDay } from "@/lib/balances";

export const dynamic = "force-dynamic";

const LIMIT = 1000;

/**
 * GET /api/transactions?from=&to=&accountId=&categoryId=(id|none)&q=&transfers=(include|exclude|only)
 */
export async function GET(req: Request) {
  const filters = parseTransactionFilters(new URL(req.url).searchParams);
  if (!filters) return badRequest("Datas devem ser AAAA-MM-DD.");
  const where = transactionWhere(filters);

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

  // O saldo só faz sentido com escopo definido: uma conta ou todas.
  const scopeAccountId = filters.accountIds.length === 1 ? filters.accountIds[0] : null;

  return NextResponse.json({
    transactions: rows.map((r) => ({ ...r, day: dateToDay(r.date), raw: undefined })),
    totals: { incomeCents, expenseCents, netCents: incomeCents + expenseCents, count, shown: rows.length, limit: LIMIT },
    balances: await dayBalances(scopeAccountId, rows),
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
