import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/categories → grupos com categorias e contagem de transações. */
export async function GET() {
  const groups = await prisma.categoryGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      categories: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { transactions: true } } },
      },
    },
  });
  const uncategorized = await prisma.transaction.count({ where: { categoryId: null, account: { ignored: false } } });
  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      sortOrder: g.sortOrder,
      categories: g.categories.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder, count: c._count.transactions })),
    })),
    uncategorized,
  });
}

/** POST /api/categories { name, groupId } */
export async function POST(req: Request) {
  const body = await readJson<{ name?: string; groupId?: string }>(req);
  const name = body.name?.trim();
  if (!name) return badRequest("Nome obrigatório.");
  if (!body.groupId) return badRequest("groupId obrigatório.");
  const group = await prisma.categoryGroup.findUnique({ where: { id: body.groupId }, include: { _count: { select: { categories: true } } } });
  if (!group) return badRequest("Grupo não existe.", 404);
  try {
    const c = await prisma.category.create({ data: { name, groupId: group.id, sortOrder: group._count.categories } });
    return NextResponse.json(c, { status: 201 });
  } catch {
    return badRequest("Já existe uma categoria com esse nome nesse grupo.", 409);
  }
}
