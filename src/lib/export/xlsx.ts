/**
 * Planilha Excel: uma aba "Transações" pronta para filtrar (cabeçalho fixo e autofiltro)
 * e uma aba "Resumo" com o recorte exportado e os totais.
 */

import ExcelJS from "exceljs";
import { dayToDate } from "@/lib/dates";
import type { ExportData, ExportRow } from "@/lib/export/rows";

const MONEY_FORMAT = 'R$ #,##0.00;[Red]-R$ #,##0.00';
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };

interface Column {
  header: string;
  width: number;
  value: (r: ExportRow) => string | number | Date | null;
}

const COLUMNS: Column[] = [
  { header: "Data", width: 12, value: (r) => dayToDate(r.day) },
  { header: "Conta", width: 24, value: (r) => r.accountName },
  { header: "Banco", width: 18, value: (r) => r.bankName },
  { header: "Descrição", width: 48, value: (r) => r.description },
  { header: "Contraparte", width: 28, value: (r) => r.counterparty },
  { header: "Grupo", width: 20, value: (r) => r.groupName },
  { header: "Categoria", width: 24, value: (r) => r.categoryName },
  { header: "Valor", width: 16, value: (r) => r.amountCents / 100 },
  { header: "Transferência", width: 14, value: (r) => (r.isTransfer ? "sim" : "não") },
  { header: "Situação", width: 12, value: (r) => r.status },
  { header: "Notas", width: 30, value: (r) => r.notes },
];

const DATE_COL = 1;
const AMOUNT_COL = COLUMNS.findIndex((c) => c.header === "Valor") + 1;

export async function buildXlsx(data: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CA Planner";

  const sheet = wb.addWorksheet("Transações", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = HEADER_FILL;

  for (const r of data.rows) {
    const row = sheet.addRow(COLUMNS.map((c) => c.value(r)));
    row.getCell(DATE_COL).numFmt = "dd/mm/yyyy";
    row.getCell(AMOUNT_COL).numFmt = MONEY_FORMAT;
    // Transferência não entra nos totais: fica cinza, como na tela.
    if (r.isTransfer) row.font = { color: { argb: "FF94A3B8" } };
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  addSummarySheet(wb, data);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function addSummarySheet(wb: ExcelJS.Workbook, data: ExportData) {
  const sheet = wb.addWorksheet("Resumo");
  sheet.columns = [{ width: 22 }, { width: 60 }];

  const title = sheet.addRow(["CA Planner — Transações"]);
  title.font = { bold: true, size: 14 };
  sheet.addRow([]);

  for (const [label, value] of data.summary) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  sheet.addRow([]);

  const totals: Array<[string, number]> = [
    ["Receitas", data.totals.incomeCents],
    ["Despesas", data.totals.expenseCents],
    ["Resultado", data.totals.netCents],
    ["Transferências (fora do resultado)", data.totals.transferCents],
  ];
  for (const [label, cents] of totals) {
    const row = sheet.addRow([label, cents / 100]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).numFmt = MONEY_FORMAT;
  }
  sheet.addRow([]);
  sheet.addRow(["", "Transferências entre contas próprias ficam fora de receitas, despesas e resultado."]);
}
