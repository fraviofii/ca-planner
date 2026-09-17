import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, currentMonth, dayToDate, isValidDay } from "@/lib/dates";
import { badRequest, readJson } from "@/lib/http";
import { hasOccurrenceOn, isPaymentType, isPlanStatus, isRecurrence, statusLocked, type PlanStatus, type Recurrence } from "@/lib/plan";
import { checkRefs, loadOccurrence, planIncludes, ruleOf, toOccurrence } from "@/lib/plan-server";

export const dynamic = "force-dynamic";

type Scope = "one" | "future";

/**
 * GET /api/plan/:id?day=AAAA-MM-DD — uma ocorrência já com a exceção do dia aplicada.
 * É o que a página de edição carrega; por isso não exige o mês corrente (quem barra a
 * alteração fora dele são o PATCH e o DELETE).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const day = new URL(req.url).searchParams.get("day");
  if (!isValidDay(day)) return badRequest("Dia deve ser AAAA-MM-DD.");

  const item = await prisma.planItem.findUnique({
    where: { id },
    include: { ...planIncludes, exceptions: { where: { day: dayToDate(day) }, include: planIncludes } },
  });
  if (!item) return badRequest("Item de planejamento não encontrado.", 404);

  const rule = ruleOf(item);
  const ex = item.exceptions[0] ?? null;
  if (!hasOccurrenceOn(rule, day) || ex?.skipped) return badRequest("Esse dia não é uma ocorrência deste item.", 404);

  return NextResponse.json({ occurrence: toOccurrence(item, ex, day, rule), editable: day.slice(0, 7) === currentMonth() });
}

interface PatchBody {
  day?: string;
  scope?: string;
  description?: string;
  amountCents?: number;
  categoryId?: string | null;
  accountId?: string | null;
  paymentType?: string | null;
  status?: string;
  notes?: string | null;
  recurrence?: string;
  endDay?: string | null;
}

/**
 * PATCH /api/plan/:id — altera uma ocorrência.
 *
 * `scope: "one"` grava uma exceção só para aquele dia; `scope: "future"` fecha a regra
 * na véspera e abre uma nova a partir dali (ou altera a própria regra, quando o dia
 * editado é o começo dela). Só vale para o mês corrente: os outros são leitura.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<PatchBody>(req);

  const found = await loadOccurrence(id, body.day);
  if ("error" in found) return found.error;
  const { item, rule, day } = found;

  const scope: Scope = body.scope === "future" ? "future" : "one";
  const description = body.description?.trim();
  if (!description) return badRequest("Descrição obrigatória.");
  const amountCents = body.amountCents;
  if (!Number.isInteger(amountCents) || !amountCents) return badRequest("Valor obrigatório.");

  const categoryId = body.categoryId ?? null;
  const accountId = body.accountId ?? null;
  const refs = await checkRefs(categoryId, accountId);
  if (refs) return refs;

  const paymentType = body.paymentType ?? null;
  if (paymentType !== null && !isPaymentType(paymentType)) return badRequest("Forma de pagamento inválida.");
  const wanted = body.status ?? "OPEN";
  if (!isPlanStatus(wanted)) return badRequest("Estado inválido.");
  const status: PlanStatus = statusLocked(paymentType) ? "OPEN" : wanted; // débito automático não tem estado

  const values = { description, amountCents: amountCents as number, categoryId, accountId, paymentType, notes: body.notes?.trim() || null };

  // Exceção: vale só para aquele dia, e guarda a ocorrência inteira.
  if (rule.recurrence !== "NONE" && scope === "one") {
    const ex = await prisma.planItemException.upsert({
      where: { itemId_day: { itemId: item.id, day: dayToDate(day) } },
      create: { itemId: item.id, day: dayToDate(day), skipped: false, ...values, status },
      update: { skipped: false, ...values, status },
    });
    return NextResponse.json(ex);
  }

  // Daqui para baixo mexe na série. A recorrência e o fim podem mudar junto.
  if (body.recurrence !== undefined && !isRecurrence(body.recurrence)) return badRequest("Recorrência inválida.");
  const recurrence: Recurrence = body.recurrence === undefined ? rule.recurrence : (body.recurrence as Recurrence);

  let endDay: string | null = "endDay" in body ? body.endDay ?? null : rule.endDay;
  if (endDay !== null) {
    if (!isValidDay(endDay)) return badRequest("Data-fim deve ser AAAA-MM-DD.");
    if (endDay < day) return badRequest("Data-fim é anterior ao início.");
  }
  if (recurrence === "NONE") endDay = null;

  // Numa série, o estado continua sendo da ocorrência: a regra nasce aberta e o dia
  // editado ganha uma exceção só com o estado escolhido (ver markStatus).
  const ruleStatus = recurrence === "NONE" ? status : "OPEN";

  // O dia editado é o começo da regra (ou o item nem se repete): altera a própria linha.
  if (day === rule.startDay) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.planItemException.deleteMany({ where: { itemId: item.id, day: { gte: dayToDate(day) } } });
      const row = await tx.planItem.update({
        where: { id: item.id },
        data: { ...values, status: ruleStatus, recurrence, endDay: endDay ? dayToDate(endDay) : null },
      });
      await markStatus(tx, row.id, day, recurrence, status, values);
      return row;
    });
    return NextResponse.json(updated);
  }

  // Corta a série na véspera e começa outra, com os valores novos, a partir deste dia.
  const created = await prisma.$transaction(async (tx) => {
    await tx.planItemException.deleteMany({ where: { itemId: item.id, day: { gte: dayToDate(day) } } });
    await tx.planItem.update({ where: { id: item.id }, data: { endDay: dayToDate(addDays(day, -1)) } });
    const row = await tx.planItem.create({
      data: { ...values, status: ruleStatus, startDay: dayToDate(day), recurrence, endDay: endDay ? dayToDate(endDay) : null },
    });
    await markStatus(tx, row.id, day, recurrence, status, values);
    return row;
  });
  return NextResponse.json(created, { status: 201 });
}

/**
 * Guarda o estado de um dia de uma série. A exceção sai com os mesmos valores da regra —
 * o que muda é só o estado —, porque a exceção guarda a ocorrência inteira.
 */
async function markStatus(
  tx: Prisma.TransactionClient,
  itemId: string,
  day: string,
  recurrence: Recurrence,
  status: PlanStatus,
  values: { description: string; amountCents: number; categoryId: string | null; accountId: string | null; paymentType: string | null; notes: string | null },
) {
  if (recurrence === "NONE" || status === "OPEN") return; // sem série, ou nada a destacar
  await tx.planItemException.create({ data: { itemId, day: dayToDate(day), skipped: false, ...values, status } });
}

/** DELETE /api/plan/:id?day=AAAA-MM-DD&scope=one|future */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const scope: Scope = url.searchParams.get("scope") === "future" ? "future" : "one";

  const found = await loadOccurrence(id, url.searchParams.get("day"));
  if ("error" in found) return found.error;
  const { item, rule, day } = found;

  if (rule.recurrence === "NONE" || (scope === "future" && day === rule.startDay)) {
    await prisma.planItem.delete({ where: { id: item.id } }); // leva junto as exceções (cascade)
    return NextResponse.json({ ok: true, removed: "item" });
  }

  if (scope === "future") {
    await prisma.$transaction([
      prisma.planItemException.deleteMany({ where: { itemId: item.id, day: { gte: dayToDate(day) } } }),
      prisma.planItem.update({ where: { id: item.id }, data: { endDay: dayToDate(addDays(day, -1)) } }),
    ]);
    return NextResponse.json({ ok: true, removed: "future" });
  }

  await prisma.planItemException.upsert({
    where: { itemId_day: { itemId: item.id, day: dayToDate(day) } },
    create: { itemId: item.id, day: dayToDate(day), skipped: true },
    update: { skipped: true, description: null, amountCents: null, categoryId: null, accountId: null, paymentType: null, status: "OPEN", notes: null },
  });
  return NextResponse.json({ ok: true, removed: "occurrence" });
}
