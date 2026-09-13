import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayToDate, isValidDay } from "@/lib/dates";
import { badRequest, readJson } from "@/lib/http";
import { hasOccurrenceOn } from "@/lib/plan";
import { ruleOf } from "@/lib/plan-server";

export const dynamic = "force-dynamic";

interface Body {
  transactionId?: string;
  itemId?: string | null; // null = "não estava no plano"
  day?: string | null;
}

/**
 * PUT /api/plan-match — marca à mão que uma transação cumpriu (ou não) um item previsto.
 * A marcação vence o palpite automático; uma ocorrência só pode estar casada com uma
 * transação, então marcar rouba o vínculo de quem o tinha.
 */
export async function PUT(req: Request) {
  const body = await readJson<Body>(req);
  if (!body.transactionId) return badRequest("transactionId obrigatório.");

  const transaction = await prisma.transaction.findUnique({ where: { id: body.transactionId }, select: { id: true } });
  if (!transaction) return badRequest("Transação não encontrada.", 404);

  // Sem item: o usuário está dizendo que esta transação não estava no plano.
  if (!body.itemId) {
    const match = await prisma.planMatch.upsert({
      where: { transactionId: transaction.id },
      create: { transactionId: transaction.id, itemId: null, day: null },
      update: { itemId: null, day: null },
    });
    return NextResponse.json(match);
  }

  if (!isValidDay(body.day)) return badRequest("Dia da ocorrência deve ser AAAA-MM-DD.");
  const item = await prisma.planItem.findUnique({ where: { id: body.itemId } });
  if (!item) return badRequest("Item de planejamento não encontrado.", 404);
  if (!hasOccurrenceOn(ruleOf(item), body.day)) return badRequest("Esse dia não é uma ocorrência deste item.");

  const [, match] = await prisma.$transaction([
    // uma ocorrência serve a uma transação só
    prisma.planMatch.deleteMany({ where: { itemId: item.id, day: dayToDate(body.day), NOT: { transactionId: transaction.id } } }),
    prisma.planMatch.upsert({
      where: { transactionId: transaction.id },
      create: { transactionId: transaction.id, itemId: item.id, day: dayToDate(body.day) },
      update: { itemId: item.id, day: dayToDate(body.day) },
    }),
  ]);
  return NextResponse.json(match);
}

/** DELETE /api/plan-match?transactionId= — apaga a marcação e devolve a linha ao palpite. */
export async function DELETE(req: Request) {
  const transactionId = new URL(req.url).searchParams.get("transactionId");
  if (!transactionId) return badRequest("transactionId obrigatório.");
  await prisma.planMatch.deleteMany({ where: { transactionId } });
  return NextResponse.json({ ok: true });
}
