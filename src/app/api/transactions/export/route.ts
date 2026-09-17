import { NextResponse } from "next/server";
import { badRequest } from "@/lib/http";
import { parseTransactionFilters } from "@/lib/transaction-filters";
import { loadExportData, TooManyRowsError } from "@/lib/export/rows";
import { buildCsv } from "@/lib/export/csv";
import { buildXlsx } from "@/lib/export/xlsx";
import { buildPdf } from "@/lib/export/pdf";

export const dynamic = "force-dynamic";

const FORMATS = {
  csv: { ext: "csv", type: "text/csv; charset=utf-8" },
  xlsx: { ext: "xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  pdf: { ext: "pdf", type: "application/pdf" },
} as const;

type Format = keyof typeof FORMATS;

/**
 * GET /api/transactions/export?format=(csv|xlsx|pdf)&from=&to=&accountId=&accountId=…&categoryId=&q=&transfers=
 *
 * Mesmos filtros da listagem — `accountId` pode repetir para exportar várias contas
 * no mesmo arquivo — sem o limite de linhas da tela.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const format = params.get("format") ?? "xlsx";
  if (!isFormat(format)) return badRequest("Formato deve ser csv, xlsx ou pdf.");

  const filters = parseTransactionFilters(params);
  if (!filters) return badRequest("Datas devem ser AAAA-MM-DD.");
  if (filters.from && filters.to && filters.from > filters.to) return badRequest("A data inicial vem depois da final.");

  try {
    const data = await loadExportData(filters);
    const body = format === "csv" ? buildCsv(data) : format === "xlsx" ? await buildXlsx(data) : await buildPdf(data, new Date());
    const { ext, type } = FORMATS[format];
    const filename = `${data.filenameBase}.${ext}`;

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(body.length),
        "Content-Disposition": `attachment; filename="${asciiName(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof TooManyRowsError) return badRequest(e.message);
    throw e;
  }
}

function isFormat(v: string): v is Format {
  return v in FORMATS;
}

/** Nome sem acento nem aspas, para o `filename=` simples de clientes antigos. */
function asciiName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]/g, "_");
}
