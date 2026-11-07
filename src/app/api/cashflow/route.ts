import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays, currentMonth, dateToDay, dayToDate, monthRange, todayDay } from "@/lib/dates";
import { balanceScope, dailyBalances, movementsByDay } from "@/lib/balances";
import { occurrenceKey } from "@/lib/plan-match";
import { loadPlanOccurrences, planOptions, resolvePlanMatches, type PlanOccurrence } from "@/lib/plan-match-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cashflow?accountId=
 *
 * Fluxo de caixa do mês corrente: saldo no fim de cada dia, real até hoje e previsto
 * daí em diante. O corte é hoje — até hoje vale o que aconteceu de verdade, depois
 * vale o planejamento —, porque plano e transação não se conversam: somar os dois no
 * mesmo dia contaria duas vezes a conta que já foi paga.
 *
 * Sem accountId, consolida todas as contas não ignoradas e projeta inclusive os itens
 * de planejamento sem conta; com accountId, projeta só o que foi marcado para ela.
 */
export async function GET(req: Request) {
  const accountId = new URL(req.url).searchParams.get("accountId") || null;
  const month = currentMonth();
  const { from, to } = monthRange(month);
  const today = todayDay();

  const account = accountId ? await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, name: true } }) : null;
  if (accountId && !account) return NextResponse.json({ error: "Conta não existe." }, { status: 404 });

  const scope = await balanceScope(accountId);
  if (!scope) {
    return NextResponse.json({
      month,
      today,
      available: false,
      reason: accountId ? "Esta conta ainda não tem saldo conhecido." : "Alguma conta ainda não tem saldo conhecido.",
      scope: { accountId, accountName: account?.name ?? null, accountCount: 0 },
      days: [],
      summary: null,
    });
  }

  const movements = await movementsByDay(scope.accountIds, from);
  const realized = dailyBalances(scope.anchorCents, movements, from, today);
  const realizedEntries = await transactionEntries(scope.accountIds, from, today);
  const { plannedEntries, occurrences, ignoredPlan, unassignedPlan } = await plannedMovements(accountId, from, to, today);

  // Quem já foi cumprido não pode ser previsto de novo: casa as transações realizadas
  // com o que estava no plano e tira do futuro o que a marcação manual já deu por pago.
  const matches = await resolveMatches(realizedEntries, occurrences, today);
  for (const [day, list] of plannedEntries) {
    const remaining = list.filter((e) => !e.itemId || !matches.doneOccurrences.has(occurrenceKey(e.itemId, day)));
    if (remaining.length) plannedEntries.set(day, remaining);
    else plannedEntries.delete(day);
  }

  // O saldo de hoje é o último realizado; daí para frente só o planejamento mexe nele.
  const days = realized.map((r) => ({
    day: r.day,
    balanceCents: r.balanceCents,
    movementCents: r.movementCents,
    projected: false,
    entries: (realizedEntries.get(r.day) ?? []).map((e) => ({ ...e, plan: matches.byTransaction.get(e.transactionId ?? "") ?? null })),
  }));
  let balanceCents = days[days.length - 1].balanceCents;
  for (let day = addDays(today, 1); day <= to; day = addDays(day, 1)) {
    const entries = (plannedEntries.get(day) ?? []).map((e) => ({ ...e, plan: null }));
    const movementCents = entries.reduce((sum, e) => sum + e.amountCents, 0);
    balanceCents += movementCents;
    days.push({ day, balanceCents, movementCents, projected: true, entries });
  }

  const future = days.filter((d) => d.projected);
  const lowest = days.reduce((min, d) => (d.balanceCents < min.balanceCents ? d : min), days[0]);

  return NextResponse.json({
    month,
    today,
    available: true,
    scope: { accountId, accountName: account?.name ?? null, accountCount: scope.accountCount },
    days,
    planOptions: planOptions(occurrences, matches.byTransaction),
    summary: {
      todayCents: days[realized.length - 1].balanceCents,
      endCents: days[days.length - 1].balanceCents,
      plannedIncomeCents: future.reduce((s, d) => s + Math.max(0, d.movementCents), 0),
      plannedExpenseCents: future.reduce((s, d) => s + Math.min(0, d.movementCents), 0),
      lowestCents: lowest.balanceCents,
      lowestDay: lowest.day,
      ignoredPlan,
      unassignedPlan,
    },
  });
}

/** Os lançamentos reais do trecho já realizado, para a tabela mostrar o que moveu o saldo. */
async function transactionEntries(accountIds: string[], from: string, to: string) {
  const rows = await prisma.transaction.findMany({
    where: { accountId: { in: accountIds }, date: { gte: dayToDate(from), lte: dayToDate(to) } },
    select: { id: true, date: true, description: true, amountCents: true, account: { select: { id: true, name: true } } },
    orderBy: [{ date: "asc" }, { amountCents: "asc" }],
  });

  const byDay = new Map<string, CashFlowEntry[]>();
  for (const r of rows) {
    const day = dateToDay(r.date);
    const list = byDay.get(day) ?? [];
    list.push({ transactionId: r.id, description: r.description, accountId: r.account.id, accountName: r.account.name, amountCents: r.amountCents });
    byDay.set(day, list);
  }
  return byDay;
}

interface CashFlowEntry {
  transactionId?: string; // só nas linhas realizadas
  itemId?: string; // só nas linhas previstas
  description: string;
  accountId: string | null;
  accountName: string | null;
  amountCents: number;
}

/** Casa as transações já realizadas do mês com as ocorrências previstas — ver plan-match-server.ts. */
function resolveMatches(realizedEntries: Map<string, CashFlowEntry[]>, occurrences: PlanOccurrence[], today: string) {
  const transactions = [...realizedEntries.entries()].flatMap(([day, list]) =>
    list.map((e) => ({ id: e.transactionId!, day, amountCents: e.amountCents, accountId: e.accountId! })),
  );
  return resolvePlanMatches(transactions, occurrences, today);
}

/**
 * Ocorrências do planejamento que ainda vão acontecer neste mês, dia a dia.
 *
 * Também devolve o que ficou de fora, para a tela poder avisar: o que estava previsto
 * para antes de hoje (assumido como já realizado, senão contaria em dobro) e, quando
 * se olha uma conta só, o que está previsto sem conta definida.
 */
async function plannedMovements(accountId: string | null, from: string, to: string, today: string) {
  const occurrences = await loadPlanOccurrences(from, to);

  const plannedEntries = new Map<string, CashFlowEntry[]>();
  const ignoredPlan = { count: 0, cents: 0 };
  const unassignedPlan = { count: 0, cents: 0 };

  for (const occ of occurrences) {
    if (accountId && occ.accountId !== accountId) {
      if (occ.accountId === null && occ.day > today) {
        unassignedPlan.count++;
        unassignedPlan.cents += occ.amountCents;
      }
      continue;
    }
    if (occ.day <= today) {
      ignoredPlan.count++;
      ignoredPlan.cents += occ.amountCents;
      continue;
    }
    const list = plannedEntries.get(occ.day) ?? [];
    list.push({ itemId: occ.itemId, description: occ.description, accountId: occ.accountId, accountName: occ.accountName, amountCents: occ.amountCents });
    plannedEntries.set(occ.day, list);
  }
  for (const list of plannedEntries.values()) list.sort((a, b) => a.amountCents - b.amountCents);
  return { plannedEntries, occurrences, ignoredPlan, unassignedPlan };
}
