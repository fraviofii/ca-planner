import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentMonth, dateToDay, dayToDate, isValidDay, isValidMonth, monthRange } from "@/lib/dates";
import { badRequest, readJson } from "@/lib/http";
import { isPaymentType, isPlanStatus, isRecurrence, occurrencesBetween, statusLocked } from "@/lib/plan";
import { checkRefs, groupSortOrder, planIncludes, ruleOf, toOccurrence } from "@/lib/plan-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/plan?month=AAAA-MM
 * Ocorrências previstas do mês (projetadas das regras, com as exceções aplicadas),
 * mais os totais e as quebras por categoria e por conta.
 */
export async function GET(req: Request) {
  const month = new URL(req.url).searchParams.get("month") ?? currentMonth();
  if (!isValidMonth(month)) return badRequest("month deve ser AAAA-MM.");
  const { from, to } = monthRange(month);

  const items = await prisma.planItem.findMany({
    where: {
      startDay: { lte: dayToDate(to) },
      OR: [{ endDay: null }, { endDay: { gte: dayToDate(from) } }],
    },
    include: {
      ...planIncludes,
      exceptions: { where: { day: { gte: dayToDate(from), lte: dayToDate(to) } }, include: planIncludes },
    },
  });

  const occurrences = [];
  for (const item of items) {
    const rule = ruleOf(item);
    const byDay = new Map(item.exceptions.map((e) => [dateToDay(e.day), e]));
    for (const day of occurrencesBetween(rule, from, to)) {
      const ex = byDay.get(day) ?? null;
      if (ex?.skipped) continue;
      occurrences.push({ ...toOccurrence(item, ex, day, rule), categorySortOrder: groupSortOrder(item, ex) });
    }
  }
  occurrences.sort((a, b) => a.day.localeCompare(b.day) || a.description.localeCompare(b.description));

  return NextResponse.json({
    month,
    editable: month === currentMonth(),
    occurrences: occurrences.map(({ categorySortOrder: _ignored, ...o }) => o),
    ...aggregate(occurrences),
  });
}

type Agg = { incomeCents: number; expenseCents: number; count: number };
type Bucket = Agg & { id: string | null; name: string };

function addTo(agg: Agg, cents: number) {
  agg.count++;
  if (cents >= 0) agg.incomeCents += cents;
  else agg.expenseCents += cents;
}

function aggregate(occurrences: Array<{ amountCents: number; category: { id: string; name: string; group: { id: string; name: string } } | null; categorySortOrder: number; account: { id: string; name: string } | null }>) {
  let incomeCents = 0;
  let expenseCents = 0;
  const groups = new Map<string, Bucket & { sortOrder: number; categories: Map<string, Bucket> }>();
  const accounts = new Map<string, Bucket>();

  for (const o of occurrences) {
    if (o.amountCents >= 0) incomeCents += o.amountCents;
    else expenseCents += o.amountCents;

    const gKey = o.category?.group.id ?? "__none";
    const g = groups.get(gKey) ?? {
      id: o.category?.group.id ?? null,
      name: o.category?.group.name ?? "Sem categoria",
      sortOrder: o.categorySortOrder,
      incomeCents: 0,
      expenseCents: 0,
      count: 0,
      categories: new Map<string, Bucket>(),
    };
    groups.set(gKey, g);
    const cKey = o.category?.id ?? "__none";
    const c = g.categories.get(cKey) ?? { id: o.category?.id ?? null, name: o.category?.name ?? "Sem categoria", incomeCents: 0, expenseCents: 0, count: 0 };
    g.categories.set(cKey, c);
    addTo(g, o.amountCents);
    addTo(c, o.amountCents);

    const aKey = o.account?.id ?? "__none";
    const a = accounts.get(aKey) ?? { id: o.account?.id ?? null, name: o.account?.name ?? "Sem conta", incomeCents: 0, expenseCents: 0, count: 0 };
    accounts.set(aKey, a);
    addTo(a, o.amountCents);
  }

  return {
    totals: { incomeCents, expenseCents, netCents: incomeCents + expenseCents, count: occurrences.length },
    groups: [...groups.values()]
      .sort((a, b) => a.expenseCents - b.expenseCents || a.sortOrder - b.sortOrder)
      .map(({ sortOrder: _ignored, ...g }) => ({ ...g, categories: [...g.categories.values()].sort((a, b) => a.expenseCents - b.expenseCents) })),
    accounts: [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

interface CreateBody {
  day?: string;
  description?: string;
  amountCents?: number;
  categoryId?: string | null;
  accountId?: string | null;
  paymentType?: string | null;
  status?: string;
  recurrence?: string;
  endDay?: string | null;
  notes?: string | null;
}

/** POST /api/plan — cria um item. Só é possível planejar dentro do mês corrente. */
export async function POST(req: Request) {
  const body = await readJson<CreateBody>(req);

  if (!isValidDay(body.day)) return badRequest("Dia deve ser AAAA-MM-DD.");
  if (body.day.slice(0, 7) !== currentMonth()) return badRequest("Só é possível lançar no mês corrente.");

  const description = body.description?.trim();
  if (!description) return badRequest("Descrição obrigatória.");

  const amountCents = body.amountCents;
  if (!Number.isInteger(amountCents) || !amountCents) return badRequest("Valor obrigatório.");

  const recurrence = body.recurrence ?? "NONE";
  if (!isRecurrence(recurrence)) return badRequest("Recorrência inválida.");

  let endDay: string | null = null;
  if (body.endDay) {
    if (recurrence === "NONE") return badRequest("Item sem recorrência não tem data-fim.");
    if (!isValidDay(body.endDay)) return badRequest("Data-fim deve ser AAAA-MM-DD.");
    if (body.endDay < body.day) return badRequest("Data-fim é anterior ao início.");
    endDay = body.endDay;
  }

  const paymentType = body.paymentType ?? null;
  if (paymentType !== null && !isPaymentType(paymentType)) return badRequest("Forma de pagamento inválida.");

  const status = body.status ?? "OPEN";
  if (!isPlanStatus(status)) return badRequest("Estado inválido.");
  const effectiveStatus = statusLocked(paymentType) ? "OPEN" : status;

  const refs = await checkRefs(body.categoryId ?? null, body.accountId ?? null);
  if (refs) return refs;

  const item = await prisma.planItem.create({
    data: {
      description,
      amountCents: amountCents as number,
      startDay: dayToDate(body.day),
      recurrence,
      endDay: endDay ? dayToDate(endDay) : null,
      categoryId: body.categoryId ?? null,
      accountId: body.accountId ?? null,
      paymentType,
      status: effectiveStatus,
      notes: body.notes?.trim() || null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
