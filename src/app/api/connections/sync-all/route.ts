import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson } from "@/lib/http";
import { addDays, isValidDay, todayDay } from "@/lib/dates";
import { syncConnection, type SyncResult } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/connections/sync-all { from?, to?, days? } */
export async function POST(req: Request) {
  const body = await readJson<{ from?: string; to?: string; days?: number }>(req);
  const to = body.to && isValidDay(body.to) ? body.to : todayDay();
  const days = Number(body.days) > 0 ? Math.min(Number(body.days), 366) : 30;
  const from = body.from && isValidDay(body.from) ? body.from : addDays(to, -days);

  const connections = await prisma.connection.findMany({ orderBy: { nickname: "asc" } });
  const results: SyncResult[] = [];
  for (const c of connections) results.push(await syncConnection(c.id, from, to));
  return NextResponse.json({ results });
}
