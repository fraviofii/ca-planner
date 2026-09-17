import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayToDate } from "@/lib/dates";
import { badRequest, readJson } from "@/lib/http";
import { isPlanStatus, statusLocked, STATUS_LOCKED_NOTE } from "@/lib/plan";
import { loadOccurrence } from "@/lib/plan-server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/plan/:id/status { day, status } — muda só o estado de uma ocorrência.
 *
 * É o atalho da lista do planejamento. O estado é sempre da ocorrência: numa série ele
 * vira exceção daquele dia, copiando os valores da regra, porque a exceção guarda a
 * ocorrência inteira — e uma exceção só de estado não conta como ocorrência "alterada".
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ day?: string; status?: string }>(req);

  const found = await loadOccurrence(id, body.day);
  if ("error" in found) return found.error;
  const { item, rule, day } = found;

  const status = body.status;
  if (!isPlanStatus(status)) return badRequest("Estado inválido.");

  if (rule.recurrence === "NONE") {
    if (statusLocked(item.paymentType)) return badRequest(STATUS_LOCKED_NOTE);
    const updated = await prisma.planItem.update({ where: { id: item.id }, data: { status } });
    return NextResponse.json({ itemId: updated.id, day, status });
  }

  const existing = await prisma.planItemException.findUnique({ where: { itemId_day: { itemId: item.id, day: dayToDate(day) } } });
  if (existing?.skipped) return badRequest("Esse dia não é uma ocorrência deste item.");

  // Vale a forma da ocorrência: a exceção manda quando existe, senão a regra.
  if (statusLocked(existing ? existing.paymentType : item.paymentType)) return badRequest(STATUS_LOCKED_NOTE);

  if (existing) {
    await prisma.planItemException.update({ where: { id: existing.id }, data: { status } });
  } else {
    await prisma.planItemException.create({
      data: {
        itemId: item.id,
        day: dayToDate(day),
        skipped: false,
        description: item.description,
        amountCents: item.amountCents,
        categoryId: item.categoryId,
        accountId: item.accountId,
        paymentType: item.paymentType,
        notes: item.notes,
        status,
      },
    });
  }
  return NextResponse.json({ itemId: item.id, day, status });
}
