import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/category-groups { name } */
export async function POST(req: Request) {
  const body = await readJson<{ name?: string }>(req);
  const name = body.name?.trim();
  if (!name) return badRequest("Nome obrigatório.");
  const count = await prisma.categoryGroup.count();
  try {
    const g = await prisma.categoryGroup.create({ data: { name, sortOrder: count } });
    return NextResponse.json(g, { status: 201 });
  } catch {
    return badRequest("Já existe um grupo com esse nome.", 409);
  }
}
