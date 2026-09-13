import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays, currentMonth, dateToDay, dayToDate, monthRange, todayDay } from "@/lib/dates";
import { balanceScope, dailyBalances, movementsByDay } from "@/lib/balances";
import { occurrencesBetween } from "@/lib/plan";
import { planIncludes, ruleOf, toOccurrence } from "@/lib/plan-server";
import { matchPlan, occurrenceKey, type MatchOccurrence } from "@/lib/plan-match";

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
  const matches = await resolveMatches(scope.accountIds, realizedEntries, occurrences, today);
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
    planOptions: occurrences.map((o) => ({ itemId: o.itemId, day: o.day, description: o.description, amountCents: o.amountCents, accountName: o.accountName })),
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

/**
 * Casa as transações já realizadas do mês com as ocorrências previstas: o que o usuário
 * marcou à mão vence, o resto sai do palpite (mesmo valor, até 3 dias, mesma conta).
 *
 * O palpite só olha ocorrências de hoje para trás — as futuras ainda não aconteceram.
 * Já uma marcação manual pode apontar para uma ocorrência futura ("paguei adiantado"),
 * e nesse caso ela precisa sumir da projeção, senão o mês contaria o valor duas vezes.
 */
async function resolveMatches(
  accountIds: string[],
  realizedEntries: Map<string, CashFlowEntry[]>,
  occurrences: Array<MatchOccurrence & { accountName: string | null }>,
  today: string,
) {
  const transactions = [...realizedEntries.entries()].flatMap(([day, list]) =>
    list.map((e) => ({ id: e.transactionId!, day, amountCents: e.amountCents, accountId: e.accountId! })),
  );
  const manual = await prisma.planMatch.findMany({
    where: { transactionId: { in: transactions.map((t) => t.id) } },
    select: { transactionId: true, itemId: true, day: true },
  });

  const byTransaction = matchPlan(
    transactions,
    occurrences.filter((o) => o.day <= today),
    manual.map((m) => ({ transactionId: m.transactionId, itemId: m.itemId, day: m.day ? dateToDay(m.day) : null })),
  );

  // As marcações manuais para ocorrências futuras não passam pelo palpite; entram aqui.
  const occurrenceAt = new Map(occurrences.map((o) => [occurrenceKey(o.itemId, o.day), o]));
  for (const m of manual) {
    if (!m.itemId || !m.day) continue;
    const key = occurrenceKey(m.itemId, dateToDay(m.day));
    const occurrence = occurrenceAt.get(key);
    if (!occurrence || occurrence.day <= today) continue;
    byTransaction.set(m.transactionId, { itemId: m.itemId, day: occurrence.day, description: occurrence.description, source: "manual", dayDiff: 0 });
  }

  const doneOccurrences = new Set<string>();
  for (const plan of byTransaction.values()) if (plan) doneOccurrences.add(occurrenceKey(plan.itemId, plan.day));
  return { byTransaction, doneOccurrences };
}

/**
 * Ocorrências do planejamento que ainda vão acontecer neste mês, dia a dia.
 *
 * Também devolve o que ficou de fora, para a tela poder avisar: o que estava previsto
 * para antes de hoje (assumido como já realizado, senão contaria em dobro) e, quando
 * se olha uma conta só, o que está previsto sem conta definida.
 */
async function plannedMovements(accountId: string | null, from: string, to: string, today: string) {
  const items = await prisma.planItem.findMany({
    where: { startDay: { lte: dayToDate(to) }, OR: [{ endDay: null }, { endDay: { gte: dayToDate(from) } }] },
    include: { ...planIncludes, exceptions: { where: { day: { gte: dayToDate(from), lte: dayToDate(to) } }, include: planIncludes } },
  });

  const plannedEntries = new Map<string, CashFlowEntry[]>();
  const occurrences: Array<MatchOccurrence & { accountName: string | null }> = [];
  const ignoredPlan = { count: 0, cents: 0 };
  const unassignedPlan = { count: 0, cents: 0 };

  for (const item of items) {
    const rule = ruleOf(item);
    const byDay = new Map(item.exceptions.map((e) => [dateToDay(e.day), e]));
    for (const day of occurrencesBetween(rule, from, to)) {
      const ex = byDay.get(day) ?? null;
      if (ex?.skipped) continue;
      const occ = toOccurrence(item, ex, day, rule);
      occurrences.push({
        itemId: item.id,
        day,
        amountCents: occ.amountCents,
        accountId: occ.accountId,
        accountName: occ.account?.name ?? null,
        description: occ.description,
      });

      if (accountId && occ.accountId !== accountId) {
        if (occ.accountId === null && day > today) {
          unassignedPlan.count++;
          unassignedPlan.cents += occ.amountCents;
        }
        continue;
      }
      if (day <= today) {
        ignoredPlan.count++;
        ignoredPlan.cents += occ.amountCents;
        continue;
      }
      const list = plannedEntries.get(day) ?? [];
      list.push({ itemId: item.id, description: occ.description, accountId: occ.accountId, accountName: occ.account?.name ?? null, amountCents: occ.amountCents });
      plannedEntries.set(day, list);
    }
  }
  for (const list of plannedEntries.values()) list.sort((a, b) => a.amountCents - b.amountCents);
  return { plannedEntries, occurrences, ignoredPlan, unassignedPlan };
}
