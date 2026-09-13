/**
 * Casamento entre transações realizadas e ocorrências do planejamento.
 *
 * Plano e transação não têm ligação no banco (o plano é só previsão), então o vínculo é
 * inferido: mesmo valor em centavos, até WINDOW_DAYS de diferença, e a mesma conta
 * quando o item de planejamento tem conta. As descrições não servem para nada aqui —
 * "Cartão PJ Itaú" chega do banco como "Pix enviado - Phi Innovations Sistemas Ltda".
 *
 * O palpite é sempre um-para-um e nunca é gravado. O que o usuário marca à mão (tabela
 * PlanMatch) vence o palpite e é aplicado antes dele.
 */

const WINDOW_DAYS = 3;

export interface MatchTransaction {
  id: string;
  day: string;
  amountCents: number;
  accountId: string;
}

export interface MatchOccurrence {
  itemId: string;
  day: string;
  amountCents: number;
  accountId: string | null;
  description: string;
}

export interface ManualMatch {
  transactionId: string;
  itemId: string | null; // null = "esta não estava no plano"
  day: string | null;
}

export interface MatchedPlan {
  itemId: string;
  day: string;
  description: string;
  source: "auto" | "manual";
  dayDiff: number; // dias entre o previsto e o realizado (negativo = pagou antes)
}

export const occurrenceKey = (itemId: string, day: string) => `${itemId}|${day}`;

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Resolve o casamento de cada transação. Devolve null explícito para as que o usuário
 * marcou como fora do plano — assim o palpite não volta a marcá-las.
 */
export function matchPlan(
  transactions: MatchTransaction[],
  occurrences: MatchOccurrence[],
  manual: ManualMatch[],
): Map<string, MatchedPlan | null> {
  const byTransaction = new Map<string, MatchedPlan | null>();
  const usedOccurrences = new Set<string>();
  const occurrenceAt = new Map(occurrences.map((o) => [occurrenceKey(o.itemId, o.day), o]));

  // 1. O que foi marcado à mão manda.
  for (const m of manual) {
    if (!m.itemId || !m.day) {
      byTransaction.set(m.transactionId, null);
      continue;
    }
    const occurrence = occurrenceAt.get(occurrenceKey(m.itemId, m.day));
    if (!occurrence) continue; // a ocorrência sumiu (item editado): volta a valer o palpite
    const transaction = transactions.find((t) => t.id === m.transactionId);
    usedOccurrences.add(occurrenceKey(m.itemId, m.day));
    byTransaction.set(m.transactionId, {
      itemId: m.itemId,
      day: m.day,
      description: occurrence.description,
      source: "manual",
      dayDiff: transaction ? daysBetween(m.day, transaction.day) : 0,
    });
  }

  // 2. O palpite preenche o resto, do previsto mais antigo para o mais novo.
  for (const occurrence of [...occurrences].sort((a, b) => a.day.localeCompare(b.day))) {
    if (usedOccurrences.has(occurrenceKey(occurrence.itemId, occurrence.day))) continue;

    let best: { transaction: MatchTransaction; diff: number } | null = null;
    for (const transaction of transactions) {
      if (byTransaction.has(transaction.id)) continue;
      if (transaction.amountCents !== occurrence.amountCents) continue;
      if (occurrence.accountId && occurrence.accountId !== transaction.accountId) continue;
      const diff = daysBetween(occurrence.day, transaction.day);
      if (Math.abs(diff) > WINDOW_DAYS) continue;
      // a mais próxima do dia previsto; empate fica com a mais antiga
      if (!best || Math.abs(diff) < Math.abs(best.diff) || (Math.abs(diff) === Math.abs(best.diff) && transaction.day < best.transaction.day)) {
        best = { transaction, diff };
      }
    }
    if (!best) continue;

    usedOccurrences.add(occurrenceKey(occurrence.itemId, occurrence.day));
    byTransaction.set(best.transaction.id, {
      itemId: occurrence.itemId,
      day: occurrence.day,
      description: occurrence.description,
      source: "auto",
      dayDiff: best.diff,
    });
  }

  return byTransaction;
}
