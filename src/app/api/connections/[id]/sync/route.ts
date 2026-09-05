import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";
import { addDays, isValidDay, todayDay } from "@/lib/dates";
import { syncConnection } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/connections/:id/sync { from?, to?, days? } — padrão: últimos 30 dias até ontem (D-1). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ from?: string; to?: string; days?: number }>(req);

  const to = body.to && isValidDay(body.to) ? body.to : todayDay();
  const days = Number(body.days) > 0 ? Math.min(Number(body.days), 366) : 30;
  const from = body.from && isValidDay(body.from) ? body.from : addDays(to, -days);
  if (from > to) return badRequest("Período inválido: início posterior ao fim.");

  const conn = await prisma.connection.findUnique({ where: { id } });
  if (!conn) return badRequest("Conexão não encontrada.", 404);

  const result = await syncConnection(id, from, to);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
