/**
 * CSV para abrir no Excel em português: separador ";", decimal com vírgula e BOM
 * UTF-8 na frente — sem o BOM o Excel estraga os acentos.
 */

import { formatDay } from "@/lib/dates";
import type { ExportData } from "@/lib/export/rows";

const COLUMNS = ["Data", "Conta", "Banco", "Descrição", "Contraparte", "Grupo", "Categoria", "Valor", "Transferência", "Situação", "Notas"];

export function buildCsv(data: ExportData): Buffer {
  const lines = [COLUMNS.map(cell).join(";")];
  for (const r of data.rows) {
    lines.push(
      [
        formatDay(r.day),
        r.accountName,
        r.bankName ?? "",
        r.description,
        r.counterparty ?? "",
        r.groupName ?? "",
        r.categoryName ?? "",
        decimal(r.amountCents),
        r.isTransfer ? "sim" : "não",
        r.status ?? "",
        r.notes ?? "",
      ]
        .map(cell)
        .join(";"),
    );
  }
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

/** Centavos → "-1234,56" (sem separador de milhar, que o Excel não espera no valor). */
function decimal(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function cell(value: string): string {
  const v = value.replace(/\r?\n/g, " ").trim();
  return /[";]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
