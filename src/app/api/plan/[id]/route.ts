import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays, currentMonth, dayToDate, isValidDay } from "@/lib/dates";
import { badRequest, readJson } from "@/lib/http";
import { hasOccurrenceOn, isRecurrence, type Recurrence } from "@/lib/plan";
import { checkRefs, planIncludes, ruleOf, toOccurrence } from "@/lib/plan-server";

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

  const values = { description, amountCents: amountCents as number, categoryId, accountId, notes: body.notes?.trim() || null };

  // Exceção: vale só para aquele dia, e guarda a ocorrência inteira.
  if (rule.recurrence !== "NONE" && scope === "one") {
    const ex = await prisma.planItemException.upsert({
      where: { itemId_day: { itemId: item.id, day: dayToDate(day) } },
      create: { itemId: item.id, day: dayToDate(day), skipped: false, ...values },
      update: { skipped: false, ...values },
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

  // O dia editado é o começo da regra (ou o item nem se repete): altera a própria linha.
  if (day === rule.startDay) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.planItemException.deleteMany({ where: { itemId: item.id, day: { gte: dayToDate(day) } } });
      return tx.planItem.update({ where: { id: item.id }, data: { ...values, recurrence, endDay: endDay ? dayToDate(endDay) : null } });
    });
    return NextResponse.json(updated);
  }

  // Corta a série na véspera e começa outra, com os valores novos, a partir deste dia.
  const created = await prisma.$transaction(async (tx) => {
    await tx.planItemException.deleteMany({ where: { itemId: item.id, day: { gte: dayToDate(day) } } });
    await tx.planItem.update({ where: { id: item.id }, data: { endDay: dayToDate(addDays(day, -1)) } });
    return tx.planItem.create({
      data: { ...values, startDay: dayToDate(day), recurrence, endDay: endDay ? dayToDate(endDay) : null },
    });
  });
  return NextResponse.json(created, { status: 201 });
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
    update: { skipped: true, description: null, amountCents: null, categoryId: null, accountId: null, notes: null },
  });
  return NextResponse.json({ ok: true, removed: "occurrence" });
}

/** Carrega o item e confere que o dia pedido é mesmo uma ocorrência dele, no mês corrente. */
async function loadOccurrence(id: string, day: unknown) {
  if (!isValidDay(day)) return { error: badRequest("Dia deve ser AAAA-MM-DD.") };
  if (day.slice(0, 7) !== currentMonth()) return { error: badRequest("Só é possível alterar o planejamento do mês corrente.") };

  const item = await prisma.planItem.findUnique({ where: { id } });
  if (!item) return { error: badRequest("Item de planejamento não encontrado.", 404) };

  const rule = ruleOf(item);
  if (!hasOccurrenceOn(rule, day)) return { error: badRequest("Esse dia não é uma ocorrência deste item.") };

  return { item, rule, day };
}
