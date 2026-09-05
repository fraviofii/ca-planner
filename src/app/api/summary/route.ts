import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dayToDate, isValidDay } from "@/lib/dates";
import { badRequest } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/summary?from=&to=&accountId=
 * Totais do período (transferências fora), quebra por grupo/categoria e por conta.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const accountId = url.searchParams.get("accountId");
  if ((from && !isValidDay(from)) || (to && !isValidDay(to))) return badRequest("Datas devem ser AAAA-MM-DD.");

  const where: Prisma.TransactionWhereInput = { account: { ignored: false } };
  if (from || to) where.date = { ...(from ? { gte: dayToDate(from) } : {}), ...(to ? { lte: dayToDate(to) } : {}) };
  if (accountId) where.accountId = accountId;

  const rows = await prisma.transaction.findMany({
    where,
    select: {
      amountCents: true,
      isTransfer: true,
      categoryId: true,
      accountId: true,
      category: { select: { id: true, name: true, group: { select: { id: true, name: true, sortOrder: true } } } },
      account: { select: { id: true, name: true } },
    },
  });

  let incomeCents = 0;
  let expenseCents = 0;
  let transferCents = 0;
  let uncategorized = 0;

  type CatAgg = { id: string | null; name: string; incomeCents: number; expenseCents: number; count: number };
  type GroupAgg = { id: string | null; name: string; sortOrder: number; incomeCents: number; expenseCents: number; count: number; categories: Map<string, CatAgg> };
  const groups = new Map<string, GroupAgg>();
  const accounts = new Map<string, { id: string; name: string; incomeCents: number; expenseCents: number; count: number }>();

  for (const r of rows) {
    const acc = accounts.get(r.accountId) ?? { id: r.account.id, name: r.account.name, incomeCents: 0, expenseCents: 0, count: 0 };
    accounts.set(r.accountId, acc);

    if (r.isTransfer) {
      transferCents += Math.abs(r.amountCents);
      continue;
    }
    acc.count++;
    if (r.amountCents >= 0) {
      incomeCents += r.amountCents;
      acc.incomeCents += r.amountCents;
    } else {
      expenseCents += r.amountCents;
      acc.expenseCents += r.amountCents;
    }
    if (!r.categoryId) uncategorized++;

    const gKey = r.category?.group.id ?? "__none";
    const g = groups.get(gKey) ?? {
      id: r.category?.group.id ?? null,
      name: r.category?.group.name ?? "Sem categoria",
      sortOrder: r.category?.group.sortOrder ?? 9999,
      incomeCents: 0,
      expenseCents: 0,
      count: 0,
      categories: new Map(),
    };
    groups.set(gKey, g);
    const cKey = r.category?.id ?? "__none";
    const c = g.categories.get(cKey) ?? { id: r.category?.id ?? null, name: r.category?.name ?? "Sem categoria", incomeCents: 0, expenseCents: 0, count: 0 };
    g.categories.set(cKey, c);
    for (const agg of [g, c]) {
      agg.count++;
      if (r.amountCents >= 0) agg.incomeCents += r.amountCents;
      else agg.expenseCents += r.amountCents;
    }
  }

  return NextResponse.json({
    totals: { incomeCents, expenseCents, netCents: incomeCents + expenseCents, transferCents, count: rows.length, uncategorized },
    groups: [...groups.values()]
      .sort((a, b) => a.expenseCents - b.expenseCents || a.sortOrder - b.sortOrder)
      .map((g) => ({ ...g, categories: [...g.categories.values()].sort((a, b) => a.expenseCents - b.expenseCents) })),
    accounts: [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name)),
  });
}
