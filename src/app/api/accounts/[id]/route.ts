import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** PATCH /api/accounts/:id { name?, ignored? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ name?: string; ignored?: boolean }>(req);
  const data: { name?: string; ignored?: boolean } = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return badRequest("Nome não pode ser vazio.");
    data.name = name;
  }
  if (typeof body.ignored === "boolean") data.ignored = body.ignored;
  if (!Object.keys(data).length) return badRequest("Nada para atualizar.");
  try {
    return NextResponse.json(await prisma.account.update({ where: { id }, data }));
  } catch {
    return badRequest("Conta não encontrada.", 404);
  }
}
