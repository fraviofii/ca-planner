/**
 * Linhas e cabeçalho de uma exportação de transações.
 *
 * Uma única consulta serve os três formatos: CSV, Excel e PDF só mudam a embalagem.
 * A ordem é cronológica (do mais antigo para o mais novo), independente de quantas
 * contas entraram — a coluna Conta é quem separa.
 */

import { prisma } from "@/lib/prisma";
import { dateToDay } from "@/lib/dates";
import { periodLabel, transactionWhere, TRANSFER_LABEL, type TransactionFilters } from "@/lib/transaction-filters";

export interface ExportRow {
  day: string; // AAAA-MM-DD
  accountName: string;
  bankName: string | null;
  description: string;
  counterparty: string | null;
  groupName: string | null;
  categoryName: string | null;
  amountCents: number;
  isTransfer: boolean;
  status: string | null;
  notes: string | null;
}

export interface ExportTotals {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  transferCents: number;
  count: number;
}

export interface ExportData {
  rows: ExportRow[];
  totals: ExportTotals;
  /** Linhas "rótulo: valor" que descrevem o recorte, para o topo do arquivo. */
  summary: Array<[string, string]>;
  periodLabel: string;
  /** Base do nome do arquivo, sem extensão. */
  filenameBase: string;
}

/** Quantas linhas um arquivo pode ter. Acima disso é sinal de filtro esquecido. */
export const MAX_ROWS = 50_000;

export class TooManyRowsError extends Error {
  constructor(public count: number) {
    super(`A exportação traria ${count.toLocaleString("pt-BR")} lançamentos (máximo ${MAX_ROWS.toLocaleString("pt-BR")}). Estreite o período ou escolha menos contas.`);
  }
}

export async function loadExportData(filters: TransactionFilters): Promise<ExportData> {
  const where = transactionWhere(filters);

  const count = await prisma.transaction.count({ where });
  if (count > MAX_ROWS) throw new TooManyRowsError(count);

  const found = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      account: { select: { name: true, bankName: true } },
      category: { select: { name: true, group: { select: { name: true } } } },
    },
  });

  const rows: ExportRow[] = found.map((t) => ({
    day: dateToDay(t.date),
    accountName: t.account.name,
    bankName: t.account.bankName,
    description: t.description,
    counterparty: t.counterparty,
    groupName: t.category?.group.name ?? null,
    categoryName: t.category?.name ?? null,
    amountCents: t.amountCents,
    isTransfer: t.isTransfer,
    status: t.status,
    notes: t.notes,
  }));

  const totals: ExportTotals = { incomeCents: 0, expenseCents: 0, netCents: 0, transferCents: 0, count: rows.length };
  for (const r of rows) {
    // Transferências entre contas próprias ficam fora do resultado, como na tela.
    if (r.isTransfer) totals.transferCents += r.amountCents;
    else if (r.amountCents >= 0) totals.incomeCents += r.amountCents;
    else totals.expenseCents += r.amountCents;
  }
  totals.netCents = totals.incomeCents + totals.expenseCents;

  return {
    rows,
    totals,
    summary: await summaryLines(filters, rows),
    periodLabel: periodLabel(filters),
    filenameBase: filenameBase(filters),
  };
}

async function summaryLines(filters: TransactionFilters, rows: ExportRow[]): Promise<Array<[string, string]>> {
  const lines: Array<[string, string]> = [["Período", periodLabel(filters)]];

  lines.push(["Contas", await accountsLabel(filters.accountIds)]);
  lines.push(["Categoria", await categoryLabel(filters.categoryId)]);
  lines.push(["Transferências", TRANSFER_LABEL[filters.transfers]]);
  if (filters.q) lines.push(["Busca", filters.q]);
  lines.push(["Lançamentos", String(rows.length)]);
  return lines;
}

async function accountsLabel(accountIds: string[]): Promise<string> {
  if (!accountIds.length) return "todas as contas";
  const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } }, orderBy: { name: "asc" }, select: { name: true } });
  return accounts.map((a) => a.name).join(", ") || "todas as contas";
}

async function categoryLabel(categoryId: string | null): Promise<string> {
  if (!categoryId) return "todas";
  if (categoryId === "none") return "sem categoria";
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true, group: { select: { name: true } } } });
  return category ? `${category.group.name} › ${category.name}` : "todas";
}

function filenameBase(filters: TransactionFilters): string {
  const parts = ["transacoes"];
  if (filters.from) parts.push(filters.from);
  if (filters.to) parts.push(filters.to);
  if (!filters.from && !filters.to) parts.push("completo");
  return parts.join("_");
}
