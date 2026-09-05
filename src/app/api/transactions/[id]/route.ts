import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

interface Patch {
  categoryId?: string | null;
  isTransfer?: boolean;
  notes?: string | null;
}

/** PATCH /api/transactions/:id — só o que é do usuário: categoria, transferência, notas. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<Patch>(req);
  const data: Patch = {};

  if ("categoryId" in body) {
    if (body.categoryId !== null && typeof body.categoryId !== "string") return badRequest("categoryId inválido.");
    if (body.categoryId) {
      const exists = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!exists) return badRequest("Categoria não existe.", 404);
    }
    data.categoryId = body.categoryId;
  }
  if ("isTransfer" in body) {
    if (typeof body.isTransfer !== "boolean") return badRequest("isTransfer deve ser booleano.");
    data.isTransfer = body.isTransfer;
  }
  if ("notes" in body) data.notes = body.notes ? String(body.notes) : null;

  if (!Object.keys(data).length) return badRequest("Nada para atualizar.");

  try {
    const updated = await prisma.transaction.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true, group: { select: { id: true, name: true } } } } },
    });
    return NextResponse.json(updated);
  } catch {
    return badRequest("Transação não encontrada.", 404);
  }
}
