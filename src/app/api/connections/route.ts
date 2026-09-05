import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const connections = await prisma.connection.findMany({
    orderBy: { nickname: "asc" },
    include: {
      accounts: {
        orderBy: { name: "asc" },
        include: { _count: { select: { transactions: true } } },
      },
    },
  });
  return NextResponse.json({
    connections: connections.map((c) => ({
      ...c,
      accounts: c.accounts.map((a) => ({ ...a, transactions: a._count.transactions, _count: undefined })),
    })),
  });
}

/** POST /api/connections { itemId, nickname } */
export async function POST(req: Request) {
  const body = await readJson<{ itemId?: string; nickname?: string }>(req);
  const itemId = body.itemId?.trim();
  const nickname = body.nickname?.trim();
  if (!itemId) return badRequest("itemId obrigatório (vem do Dashboard da Pluggy).");
  if (!nickname) return badRequest("Apelido obrigatório.");
  try {
    const c = await prisma.connection.create({ data: { itemId, nickname } });
    return NextResponse.json(c, { status: 201 });
  } catch {
    return badRequest("Já existe uma conexão com esse itemId.", 409);
  }
}
