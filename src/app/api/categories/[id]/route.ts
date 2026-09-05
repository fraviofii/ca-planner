import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** PATCH /api/categories/:id { name?, groupId? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ name?: string; groupId?: string }>(req);
  const data: { name?: string; groupId?: string } = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return badRequest("Nome não pode ser vazio.");
    data.name = name;
  }
  if (body.groupId) {
    const g = await prisma.categoryGroup.findUnique({ where: { id: body.groupId } });
    if (!g) return badRequest("Grupo não existe.", 404);
    data.groupId = body.groupId;
  }
  if (!Object.keys(data).length) return badRequest("Nada para atualizar.");
  try {
    return NextResponse.json(await prisma.category.update({ where: { id }, data }));
  } catch {
    return badRequest("Não foi possível atualizar (nome duplicado no grupo ou categoria inexistente).", 409);
  }
}

/** DELETE /api/categories/:id — transações voltam para "Sem categoria". */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return badRequest("Categoria não encontrada.", 404);
  }
}
