import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ name?: string }>(req);
  const name = body.name?.trim();
  if (!name) return badRequest("Nome obrigatório.");
  try {
    return NextResponse.json(await prisma.categoryGroup.update({ where: { id }, data: { name } }));
  } catch {
    return badRequest("Não foi possível renomear (nome duplicado ou grupo inexistente).", 409);
  }
}

/** DELETE — apaga o grupo e suas categorias; transações voltam para "Sem categoria". */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.categoryGroup.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return badRequest("Grupo não encontrado.", 404);
  }
}
