import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ nickname?: string; itemId?: string }>(req);
  const data: { nickname?: string; itemId?: string } = {};
  if (body.nickname?.trim()) data.nickname = body.nickname.trim();
  if (body.itemId?.trim()) data.itemId = body.itemId.trim();
  if (!Object.keys(data).length) return badRequest("Nada para atualizar.");
  try {
    return NextResponse.json(await prisma.connection.update({ where: { id }, data }));
  } catch {
    return badRequest("Não foi possível atualizar a conexão.", 409);
  }
}

/** DELETE — remove a conexão; as contas e transações ficam (desvinculadas). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.connection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return badRequest("Conexão não encontrada.", 404);
  }
}
