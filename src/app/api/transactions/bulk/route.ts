import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/transactions/bulk { ids: string[], categoryId?: string|null, isTransfer?: boolean } */
export async function POST(req: Request) {
  const body = await readJson<{ ids?: unknown; categoryId?: string | null; isTransfer?: boolean }>(req);
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  if (!ids.length) return badRequest("Informe ids.");

  const data: { categoryId?: string | null; isTransfer?: boolean } = {};
  if ("categoryId" in body) {
    if (body.categoryId) {
      const exists = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!exists) return badRequest("Categoria não existe.", 404);
    }
    data.categoryId = body.categoryId ?? null;
  }
  if (typeof body.isTransfer === "boolean") data.isTransfer = body.isTransfer;
  if (!Object.keys(data).length) return badRequest("Nada para atualizar.");

  const r = await prisma.transaction.updateMany({ where: { id: { in: ids } }, data });
  return NextResponse.json({ updated: r.count });
}
