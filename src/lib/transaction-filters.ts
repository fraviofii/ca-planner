/**
 * Filtros da lista de transações — o mesmo entendimento da querystring para a tela
 * e para a exportação, para que o arquivo traga exatamente as linhas da listagem.
 */

import type { Prisma } from "@prisma/client";
import { dayToDate, formatDay, isValidDay } from "@/lib/dates";

export type TransferFilter = "include" | "exclude" | "only";

export interface TransactionFilters {
  from: string | null;
  to: string | null;
  /** Vazio = todas as contas não ignoradas. */
  accountIds: string[];
  /** "none" = sem categoria; null = todas. */
  categoryId: string | null;
  q: string | null;
  transfers: TransferFilter;
}

/**
 * Lê os filtros de `?from=&to=&accountId=&categoryId=&q=&transfers=`.
 * `accountId` pode repetir: a exportação aceita várias contas.
 * Devolve null quando alguma data não é AAAA-MM-DD.
 */
export function parseTransactionFilters(params: URLSearchParams): TransactionFilters | null {
  const from = params.get("from");
  const to = params.get("to");
  if ((from && !isValidDay(from)) || (to && !isValidDay(to))) return null;

  const transfers = params.get("transfers");
  return {
    from: from || null,
    to: to || null,
    accountIds: [...new Set(params.getAll("accountId").map((s) => s.trim()).filter(Boolean))],
    categoryId: params.get("categoryId") || null,
    q: params.get("q")?.trim() || null,
    transfers: transfers === "exclude" || transfers === "only" ? transfers : "include",
  };
}

export function transactionWhere(f: TransactionFilters): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { account: { ignored: false } };
  if (f.from || f.to) {
    where.date = { ...(f.from ? { gte: dayToDate(f.from) } : {}), ...(f.to ? { lte: dayToDate(f.to) } : {}) };
  }
  if (f.accountIds.length === 1) where.accountId = f.accountIds[0];
  else if (f.accountIds.length > 1) where.accountId = { in: f.accountIds };
  if (f.categoryId === "none") where.categoryId = null;
  else if (f.categoryId) where.categoryId = f.categoryId;
  if (f.transfers === "exclude") where.isTransfer = false;
  if (f.transfers === "only") where.isTransfer = true;
  if (f.q) {
    where.OR = [{ description: { contains: f.q } }, { counterparty: { contains: f.q } }, { notes: { contains: f.q } }];
  }
  return where;
}

/** "01/01/2026 a 31/01/2026", "até 31/01/2026", "todo o histórico" — para cabeçalhos de arquivo. */
export function periodLabel(f: TransactionFilters): string {
  if (f.from && f.to) return `${formatDay(f.from)} a ${formatDay(f.to)}`;
  if (f.from) return `a partir de ${formatDay(f.from)}`;
  if (f.to) return `até ${formatDay(f.to)}`;
  return "todo o histórico";
}

export const TRANSFER_LABEL: Record<TransferFilter, string> = {
  include: "incluídas",
  exclude: "excluídas",
  only: "somente transferências",
};
