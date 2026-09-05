import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const accounts = await prisma.account.findMany({
    orderBy: [{ ignored: "asc" }, { name: "asc" }],
    include: {
      connection: { select: { id: true, nickname: true } },
      _count: { select: { transactions: true } },
    },
  });
  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      externalId: a.externalId,
      name: a.name,
      bankName: a.bankName,
      type: a.type,
      subtype: a.subtype,
      number: a.number,
      balanceCents: a.balanceCents,
      ignored: a.ignored,
      connection: a.connection,
      transactions: a._count.transactions,
    })),
  });
}
