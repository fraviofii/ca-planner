/** Peças do planejamento que dependem do banco (não cabem em plan.ts, que é isomórfico). */

import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/http";
import { currentMonth, dateToDay, isValidDay } from "@/lib/dates";
import type { PlanOccurrenceDto } from "@/lib/client";
import { hasOccurrenceOn, type PaymentType, type PlanRule, type PlanStatus, type Recurrence } from "@/lib/plan";

/** Confere categoria e conta informadas; devolve a resposta de erro ou null. */
export async function checkRefs(categoryId: string | null, accountId: string | null) {
  if (categoryId && !(await prisma.category.findUnique({ where: { id: categoryId } }))) return badRequest("Categoria não existe.", 404);
  if (accountId && !(await prisma.account.findUnique({ where: { id: accountId } }))) return badRequest("Conta não existe.", 404);
  return null;
}

/** O que o GET precisa saber de uma categoria para montar a ocorrência. */
type CategoryShape = { id: string; name: string; group: { id: string; name: string; sortOrder: number } };

/** Campos que tanto a regra quanto a exceção carregam. */
export interface PlanValues {
  description: string | null;
  amountCents: number | null;
  categoryId: string | null;
  category: CategoryShape | null;
  accountId: string | null;
  account: { id: string; name: string } | null;
  paymentType: string | null;
  status: string;
  notes: string | null;
}

export type PlanItemShape = PlanValues & { id: string; description: string; amountCents: number };

export const planIncludes = {
  category: { select: { id: true, name: true, group: { select: { id: true, name: true, sortOrder: true } } } },
  account: { select: { id: true, name: true } },
} as const;

export function ruleOf(item: { startDay: Date; recurrence: string; endDay: Date | null }): PlanRule {
  return { startDay: dateToDay(item.startDay), recurrence: item.recurrence as Recurrence, endDay: item.endDay ? dateToDay(item.endDay) : null };
}

/**
 * Monta a ocorrência de um dia: ou valem os campos da exceção — que guarda a ocorrência
 * inteira, nunca um remendo — ou valem os da regra.
 */
export function toOccurrence(item: PlanItemShape, ex: PlanValues | null, day: string, rule: PlanRule): PlanOccurrenceDto {
  const src = ex ?? item;
  return {
    itemId: item.id,
    day,
    description: src.description ?? item.description,
    amountCents: src.amountCents ?? item.amountCents,
    categoryId: src.categoryId,
    category: src.category ? { id: src.category.id, name: src.category.name, group: { id: src.category.group.id, name: src.category.group.name } } : null,
    accountId: src.accountId,
    account: src.account,
    paymentType: (src.paymentType as PaymentType | null) ?? null,
    status: src.status as PlanStatus,
    notes: src.notes,
    recurrence: rule.recurrence,
    seriesStartDay: rule.startDay,
    seriesEndDay: rule.endDay,
    overridden: Boolean(ex) && overridesValues(item, ex as PlanValues),
  };
}

/**
 * A exceção mudou algum valor, ou só o estado? Marcar uma ocorrência como paga grava
 * uma exceção igualzinha à regra — e essa não é uma ocorrência "alterada".
 */
function overridesValues(item: PlanItemShape, ex: PlanValues): boolean {
  return (
    (ex.description ?? item.description) !== item.description ||
    (ex.amountCents ?? item.amountCents) !== item.amountCents ||
    ex.categoryId !== item.categoryId ||
    ex.accountId !== item.accountId ||
    ex.paymentType !== item.paymentType ||
    ex.notes !== item.notes
  );
}

/** Carrega o item e confere que o dia pedido é mesmo uma ocorrência dele, no mês corrente. */
export async function loadOccurrence(id: string, day: unknown) {
  if (!isValidDay(day)) return { error: badRequest("Dia deve ser AAAA-MM-DD.") };
  if (day.slice(0, 7) !== currentMonth()) return { error: badRequest("Só é possível alterar o planejamento do mês corrente.") };

  const item = await prisma.planItem.findUnique({ where: { id } });
  if (!item) return { error: badRequest("Item de planejamento não encontrado.", 404) };

  const rule = ruleOf(item);
  if (!hasOccurrenceOn(rule, day)) return { error: badRequest("Esse dia não é uma ocorrência deste item.") };

  return { item, rule, day };
}

/** Ordem do grupo da categoria efetiva — usada só para ordenar a quebra por categoria. */
export function groupSortOrder(item: PlanItemShape, ex: PlanValues | null): number {
  return (ex ?? item).category?.group.sortOrder ?? 9999;
}
