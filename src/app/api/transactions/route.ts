import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays, dateToDay, dayToDate, monthRange, todayDay } from "@/lib/dates";
import { badRequest } from "@/lib/http";
import { parseTransactionFilters, transactionWhere } from "@/lib/transaction-filters";
import { balanceScope, closingBalances, movementsByDay } from "@/lib/balances";
import { WINDOW_DAYS, type MatchedPlan } from "@/lib/plan-match";
import { loadPlanOccurrences, planOptions, resolvePlanMatches } from "@/lib/plan-match-server";
import type { PlanOptionDto } from "@/lib/client";

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

  const [balances, plan] = await Promise.all([dayBalances(scopeAccountId, rows), planMatches(rows)]);

  return NextResponse.json({
    transactions: rows.map((r) => ({ ...r, day: dateToDay(r.date), raw: undefined, plan: plan.byTransaction.get(r.id) ?? null })),
    planOptions: plan.options,
    totals: { incomeCents, expenseCents, netCents: incomeCents + expenseCents, count, shown: rows.length, limit: LIMIT },
    balances,
  });
}

/**
 * Vínculo de cada linha com o planejamento (≈ palpite, ✓ marcação manual) — a mesma
 * resolução do fluxo de caixa, ver plan-match-server.ts.
 *
 * O palpite é um-para-um, então roda sobre *todas* as transações do intervalo, não só
 * as que passaram pelos filtros da tela: senão uma conta filtrada de fora "liberaria" a
 * ocorrência para a vizinha errada e as duas telas discordariam.
 */
async function planMatches(rows: Array<{ id: string; date: Date }>): Promise<{ byTransaction: Map<string, MatchedPlan | null>; options: PlanOptionDto[] }> {
  if (!rows.length) return { byTransaction: new Map(), options: [] };

  // rows vem em ordem decrescente. O seletor manual oferece o mês inteiro de cada linha,
  // e o palpite pode cruzar a virada do mês em até WINDOW_DAYS — o intervalo cobre os dois.
  const oldest = dateToDay(rows[rows.length - 1].date);
  const newest = dateToDay(rows[0].date);
  const from = min(monthRange(oldest.slice(0, 7)).from, addDays(oldest, -WINDOW_DAYS));
  const to = max(monthRange(newest.slice(0, 7)).to, addDays(newest, WINDOW_DAYS));
  const occurrences = await loadPlanOccurrences(from, to);
  if (!occurrences.length) return { byTransaction: new Map(), options: [] };

  const all = await prisma.transaction.findMany({
    where: { date: { gte: dayToDate(from), lte: dayToDate(to) } },
    select: { id: true, date: true, amountCents: true, accountId: true },
  });
  const { byTransaction } = await resolvePlanMatches(
    all.map((t) => ({ id: t.id, day: dateToDay(t.date), amountCents: t.amountCents, accountId: t.accountId })),
    occurrences,
    todayDay(),
  );
  return { byTransaction, options: planOptions(occurrences, byTransaction) };
}

const min = (a: string, b: string) => (a < b ? a : b);
const max = (a: string, b: string) => (a > b ? a : b);

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
