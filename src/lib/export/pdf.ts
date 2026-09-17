/**
 * PDF em A4 deitado: cabeçalho com o recorte e os totais na primeira página, tabela
 * com cabeçalho repetido nas demais e rodapé numerado.
 *
 * As fontes padrão do PDF (Helvetica) só escrevem WinAnsi, então todo texto passa por
 * `winAnsi()` antes de ir para a página — um emoji na descrição derrubaria a geração.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDay } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { ExportData, ExportRow } from "@/lib/export/rows";

const PAGE_W = 841.89; // A4 deitado
const PAGE_H = 595.28;
const MARGIN = 32;
const ROW_H = 14;
const FONT_SIZE = 8;
const GAP = 10; // respiro entre colunas, para o texto cortado não encostar no vizinho

const INK = rgb(0.09, 0.13, 0.19);
const MUTED = rgb(0.55, 0.6, 0.67);
const LINE = rgb(0.85, 0.88, 0.91);
const ZEBRA = rgb(0.976, 0.98, 0.984);
const NEGATIVE = rgb(0.62, 0.11, 0.24);
const POSITIVE = rgb(0.02, 0.42, 0.32);

interface Column {
  header: string;
  width: number; // 0 = ocupa o espaço que sobra
  align?: "right";
  value: (r: ExportRow) => string;
}

const COLUMNS: Column[] = [
  { header: "Data", width: 54, value: (r) => formatDay(r.day) },
  { header: "Conta", width: 110, value: (r) => r.accountName },
  { header: "Descrição", width: 0, value: (r) => [r.description, r.counterparty && r.counterparty !== r.description ? `— ${r.counterparty}` : ""].filter(Boolean).join(" ") },
  { header: "Categoria", width: 140, value: (r) => (r.categoryName ? `${r.groupName} › ${r.categoryName}` : "sem categoria") },
  { header: "Valor", width: 78, align: "right", value: (r) => formatCents(r.amountCents) },
];

export async function buildPdf(data: ExportData, generatedAt: Date): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`CA Planner — Transações (${data.periodLabel})`);
  doc.setCreator("CA Planner");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const widths = columnWidths();
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  y = drawIntro(page, bold, font, data, y);

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  y = drawTableHeader(page, bold, widths, y);
  let zebra = false;
  for (const row of data.rows) {
    if (y - ROW_H < MARGIN + 18) {
      newPage();
      y = drawTableHeader(page, bold, widths, y);
      zebra = false;
    }
    drawRow(page, font, widths, row, y, zebra);
    y -= ROW_H;
    zebra = !zebra;
  }

  if (!data.rows.length) {
    page.drawText(winAnsi("Nenhum lançamento com esses filtros."), { x: MARGIN, y: y - 12, size: 9, font, color: MUTED });
  }

  drawFooters(doc.getPages(), font, generatedAt);
  return Buffer.from(await doc.save());
}

function columnWidths(): number[] {
  const available = PAGE_W - MARGIN * 2 - GAP * (COLUMNS.length - 1);
  const fixed = COLUMNS.reduce((sum, c) => sum + c.width, 0);
  return COLUMNS.map((c) => (c.width === 0 ? available - fixed : c.width));
}

/** Título, recorte e totais. Devolve o y onde a tabela pode começar. */
function drawIntro(page: PDFPage, bold: PDFFont, font: PDFFont, data: ExportData, top: number): number {
  let y = top;
  page.drawText(winAnsi("Transações"), { x: MARGIN, y: y - 14, size: 16, font: bold, color: INK });
  y -= 30;

  for (const [label, value] of data.summary) {
    page.drawText(winAnsi(`${label}: `), { x: MARGIN, y, size: 8, font: bold, color: MUTED });
    const offset = bold.widthOfTextAtSize(winAnsi(`${label}: `), 8);
    page.drawText(winAnsi(truncate(value, font, 8, PAGE_W - MARGIN * 2 - offset)), { x: MARGIN + offset, y, size: 8, font, color: MUTED });
    y -= 11;
  }

  y -= 6;
  const totals: Array<[string, number]> = [
    ["Receitas", data.totals.incomeCents],
    ["Despesas", data.totals.expenseCents],
    ["Resultado", data.totals.netCents],
    ["Transferências (fora do resultado)", data.totals.transferCents],
  ];
  let x = MARGIN;
  for (const [label, cents] of totals) {
    page.drawText(winAnsi(label), { x, y, size: 9, font, color: MUTED });
    x += font.widthOfTextAtSize(winAnsi(label), 9) + 5;
    const text = winAnsi(formatCents(cents));
    page.drawText(text, { x, y, size: 9, font: bold, color: cents < 0 ? NEGATIVE : INK });
    x += bold.widthOfTextAtSize(text, 9) + 18;
  }
  return y - 16;
}

function drawTableHeader(page: PDFPage, bold: PDFFont, widths: number[], top: number): number {
  const y = top - 10;
  let x = MARGIN;
  COLUMNS.forEach((col, i) => {
    const text = winAnsi(col.header);
    const tx = col.align === "right" ? x + widths[i] - bold.widthOfTextAtSize(text, FONT_SIZE) : x;
    page.drawText(text, { x: tx, y, size: FONT_SIZE, font: bold, color: MUTED });
    x += widths[i] + GAP;
  });
  page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: PAGE_W - MARGIN, y: y - 4 }, thickness: 0.6, color: LINE });
  return y - 4 - ROW_H;
}

function drawRow(page: PDFPage, font: PDFFont, widths: number[], row: ExportRow, y: number, zebra: boolean) {
  if (zebra) {
    page.drawRectangle({ x: MARGIN - 2, y: y - 3.5, width: PAGE_W - MARGIN * 2 + 4, height: ROW_H, color: ZEBRA });
  }
  let x = MARGIN;
  COLUMNS.forEach((col, i) => {
    const text = winAnsi(truncate(col.value(row), font, FONT_SIZE, widths[i]));
    const tx = col.align === "right" ? x + widths[i] - font.widthOfTextAtSize(text, FONT_SIZE) : x;
    page.drawText(text, { x: tx, y, size: FONT_SIZE, font, color: rowColor(col, row) });
    x += widths[i] + GAP;
  });
}

function rowColor(col: Column, row: ExportRow) {
  if (row.isTransfer) return MUTED; // fora dos totais, como na tela
  if (col.align !== "right") return INK;
  return row.amountCents < 0 ? NEGATIVE : POSITIVE;
}

function drawFooters(pages: PDFPage[], font: PDFFont, generatedAt: Date) {
  const stamp = winAnsi(`CA Planner · gerado em ${generatedAt.toLocaleString("pt-BR")}`);
  pages.forEach((page, i) => {
    page.drawText(stamp, { x: MARGIN, y: MARGIN - 12, size: 7, font, color: MUTED });
    const label = winAnsi(`Página ${i + 1} de ${pages.length}`);
    page.drawText(label, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(label, 7), y: MARGIN - 12, size: 7, font, color: MUTED });
  });
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = winAnsi(text.replace(/\s+/g, " ").trim());
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let cut = clean;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

// Tudo que o cp1252 escreve; o resto vira "?" para não quebrar o arquivo.
const WIN_ANSI = /[^\t\n\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g;

function winAnsi(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(WIN_ANSI, "?");
}
