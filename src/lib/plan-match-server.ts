/**
 * Casamento plano × transações com acesso ao banco. A regra pura está em plan-match.ts;
 * aqui ficam a carga das ocorrências previstas e a resolução completa (marcação manual +
 * palpite), usadas tanto pelo fluxo de caixa quanto pela lista de transações — para que
 * as duas telas mostrem sempre o mesmo vínculo.
 */

import { prisma } from "@/lib/prisma";
import { dateToDay, dayToDate } from "@/lib/dates";
import { occurrencesBetween } from "@/lib/plan";
import { planIncludes, ruleOf, toOccurrence } from "@/lib/plan-server";
import { matchPlan, occurrenceKey, type MatchedPlan, type MatchOccurrence, type MatchTransaction } from "@/lib/plan-match";
import type { PlanOptionDto } from "@/lib/client";

export type PlanOccurrence = MatchOccurrence & { accountName: string | null };

/** Todas as ocorrências previstas entre `from` e `to` (inclusive), já com exceções aplicadas. */
export async function loadPlanOccurrences(from: string, to: string): Promise<PlanOccurrence[]> {
  const items = await prisma.planItem.findMany({
    where: { startDay: { lte: dayToDate(to) }, OR: [{ endDay: null }, { endDay: { gte: dayToDate(from) } }] },
    include: { ...planIncludes, exceptions: { where: { day: { gte: dayToDate(from), lte: dayToDate(to) } }, include: planIncludes } },
  });

  const occurrences: PlanOccurrence[] = [];
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
    }
  }
  return occurrences;
}

/**
 * Resolve o vínculo de cada transação: o que o usuário marcou à mão vence, o resto sai
 * do palpite (mesmo valor, até WINDOW_DAYS, mesma conta).
 *
 * O palpite só olha ocorrências de hoje para trás — as futuras ainda não aconteceram.
 * Já uma marcação manual pode apontar para uma ocorrência futura ("paguei adiantado").
 * `doneOccurrences` lista as ocorrências que já têm transação, para a projeção não
 * contá-las de novo.
 */
export async function resolvePlanMatches(transactions: MatchTransaction[], occurrences: PlanOccurrence[], today: string) {
  const manual = transactions.length
    ? await prisma.planMatch.findMany({
        where: { transactionId: { in: transactions.map((t) => t.id) } },
        select: { transactionId: true, itemId: true, day: true },
      })
    : [];

  const byTransaction = matchPlan(
    transactions,
    occurrences.filter((o) => o.day <= today),
    manual.map((m) => ({ transactionId: m.transactionId, itemId: m.itemId, day: m.day ? dateToDay(m.day) : null })),
  );

  // As marcações manuais para ocorrências futuras não passam pelo palpite; entram aqui.
  const occurrenceAt = new Map(occurrences.map((o) => [occurrenceKey(o.itemId, o.day), o]));
  for (const m of manual) {
    if (!m.itemId || !m.day) continue;
    const occurrence = occurrenceAt.get(occurrenceKey(m.itemId, dateToDay(m.day)));
    if (!occurrence || occurrence.day <= today) continue;
    byTransaction.set(m.transactionId, { itemId: m.itemId, day: occurrence.day, description: occurrence.description, source: "manual", dayDiff: 0 });
  }

  const doneOccurrences = new Set<string>();
  for (const plan of byTransaction.values()) if (plan) doneOccurrences.add(occurrenceKey(plan.itemId, plan.day));
  return { byTransaction, doneOccurrences };
}

/**
 * As ocorrências como o seletor "no plano?" as recebe: cada uma diz qual transação já a
 * cumpre, para a tela oferecer só as livres (e a própria, para não perder a seleção).
 */
export function planOptions(occurrences: PlanOccurrence[], byTransaction: Map<string, MatchedPlan | null>): PlanOptionDto[] {
  const takenBy = new Map<string, string>();
  for (const [transactionId, plan] of byTransaction) if (plan) takenBy.set(occurrenceKey(plan.itemId, plan.day), transactionId);
  return occurrences.map((o) => ({
    itemId: o.itemId,
    day: o.day,
    description: o.description,
    amountCents: o.amountCents,
    accountName: o.accountName,
    takenBy: takenBy.get(occurrenceKey(o.itemId, o.day)) ?? null,
  }));
}
