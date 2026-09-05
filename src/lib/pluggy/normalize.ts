import { toCents } from "@/lib/money";
import type { PluggyAccount, PluggyTransaction } from "./client";

export interface NormalizedTransaction {
  externalId: string;
  day: string; // AAAA-MM-DD
  amountCents: number; // com sinal: negativo = saiu dinheiro
  description: string;
  counterparty: string | null;
  providerCategory: string | null;
  providerType: string | null;
  status: string | null;
  raw: string;
}

/**
 * Converte a transação da Pluggy para o formato interno.
 *
 * Sinal: em conta corrente a Pluggy usa negativo para débito. Em cartão de crédito a
 * convenção inverte (positivo é despesa nova que aumenta a fatura). Invertemos o cartão
 * para que "negativo = saiu dinheiro" valha para tudo.
 */
export function normalizeTransaction(t: PluggyTransaction, account: Pick<PluggyAccount, "type">): NormalizedTransaction {
  let amount = Number(t.amount ?? 0);
  if (account.type === "CREDIT") amount = -amount;

  const pd = t.paymentData ?? undefined;
  const counterparty = pd?.receiver?.name || pd?.payer?.name || null;

  return {
    externalId: String(t.id),
    day: String(t.date ?? "").slice(0, 10),
    amountCents: toCents(amount),
    description: (t.description ?? t.descriptionRaw ?? "").toString().trim() || "SEM DESCRIÇÃO",
    counterparty,
    providerCategory: t.category ?? null,
    providerType: t.type ?? null,
    status: t.status ?? null,
    raw: JSON.stringify(t),
  };
}

/** Categorias da Pluggy que significam dinheiro trocando de bolso, não receita/despesa. */
export const TRANSFER_CATEGORIES = new Set(["Same person transfer"]);

export function looksLikeTransfer(providerCategory: string | null | undefined): boolean {
  return Boolean(providerCategory && TRANSFER_CATEGORIES.has(providerCategory));
}
