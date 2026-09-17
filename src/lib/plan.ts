/**
 * Projeção das ocorrências do planejamento.
 *
 * Uma série é guardada como uma regra só (PlanItem): dia inicial, periodicidade e um
 * fim opcional. As ocorrências dos outros meses não existem no banco — são calculadas
 * aqui, sempre em cima de dias "AAAA-MM-DD" (nunca Date local, para não escorregar de
 * fuso). Exceções de ocorrências individuais ficam em PlanItemException.
 */

import { addDays, dayToDate, shiftMonth } from "@/lib/dates";

export const RECURRENCES = ["NONE", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  NONE: "Não se repete",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
};

export function isRecurrence(v: unknown): v is Recurrence {
  return typeof v === "string" && (RECURRENCES as readonly string[]).includes(v);
}

/** Como o dinheiro se move. Opcional: quem não souber ainda deixa em branco. */
export const PAYMENT_TYPES = ["DEBIT_AUTO", "TRANSFER", "BOLETO"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  DEBIT_AUTO: "Débito automático",
  TRANSFER: "Transferência",
  BOLETO: "Boleto",
};

export function isPaymentType(v: unknown): v is PaymentType {
  return typeof v === "string" && (PAYMENT_TYPES as readonly string[]).includes(v);
}

/**
 * Em que pé está a ocorrência. É sempre por ocorrência, nunca da série: numa
 * recorrência, mudar o estado grava uma exceção só daquele dia.
 *
 * Não mexe no fluxo de caixa — lá quem decide o que já foi cumprido é a conciliação
 * com as transações reais (ver src/lib/plan-match.ts).
 */
export const PLAN_STATUSES = ["OPEN", "SCHEDULED", "DONE"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  OPEN: "Aberto",
  SCHEDULED: "Agendado",
  DONE: "Feito",
};

export function isPlanStatus(v: unknown): v is PlanStatus {
  return typeof v === "string" && (PLAN_STATUSES as readonly string[]).includes(v);
}

/**
 * Débito automático o banco cumpre sozinho: não há o que agendar nem o que marcar como
 * feito. Nesses lançamentos o estado fica travado em Aberto — na tela e na API.
 */
export function statusLocked(paymentType: string | null | undefined): boolean {
  return paymentType === "DEBIT_AUTO";
}

export const STATUS_LOCKED_NOTE = "Débito automático: o banco debita sozinho, não há estado para marcar.";

export interface PlanRule {
  startDay: string;
  recurrence: Recurrence;
  endDay: string | null;
}

/** Trava contra janelas absurdas: nenhum mês tem mais de 31 ocorrências semanais. */
const MAX_OCCURRENCES = 400;

/** Dias de uma série dentro de [from, to] (ambos inclusive), em ordem crescente. */
export function occurrencesBetween(rule: PlanRule, from: string, to: string): string[] {
  const end = rule.endDay && rule.endDay < to ? rule.endDay : to;
  if (rule.startDay > end) return [];

  switch (rule.recurrence) {
    case "NONE":
      return rule.startDay >= from ? [rule.startDay] : [];
    case "WEEKLY":
      return everyNDays(rule.startDay, 7, from, end);
    case "BIWEEKLY":
      return everyNDays(rule.startDay, 14, from, end);
    case "MONTHLY":
      return everyMonth(rule.startDay, from, end);
  }
}

/** A série ainda produz alguma ocorrência a partir de `day` (inclusive)? */
export function hasOccurrenceOn(rule: PlanRule, day: string): boolean {
  return occurrencesBetween(rule, day, day).length === 1;
}

function daysBetween(a: string, b: string): number {
  return Math.round((dayToDate(b).getTime() - dayToDate(a).getTime()) / 86_400_000);
}

function everyNDays(start: string, interval: number, from: string, end: string): string[] {
  const gap = daysBetween(start, from);
  const skipped = gap > 0 ? Math.ceil(gap / interval) : 0;
  const out: string[] = [];
  for (let day = addDays(start, skipped * interval); day <= end && out.length < MAX_OCCURRENCES; day = addDays(day, interval)) {
    out.push(day);
  }
  return out;
}

/**
 * Mesmo dia do mês, todo mês. O dia de referência é sempre o do início: quem começa
 * dia 31 cai no dia 28/29 em fevereiro e volta ao 31 em março — o mês curto não
 * desloca a série.
 */
function everyMonth(start: string, from: string, end: string): string[] {
  const anchor = Number(start.slice(8, 10));
  const out: string[] = [];
  let month = start.slice(0, 7);
  if (from.slice(0, 7) > month) month = from.slice(0, 7);
  const lastMonth = end.slice(0, 7);
  while (month <= lastMonth && out.length < MAX_OCCURRENCES) {
    const day = dayOfMonth(month, anchor);
    if (day >= from && day >= start && day <= end) out.push(day);
    month = shiftMonth(month, 1);
  }
  return out;
}

/** "AAAA-MM" + dia desejado → dia existente no mês (encurtado ao último dia, se preciso). */
function dayOfMonth(month: string, anchor: number): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(anchor, last)).padStart(2, "0")}`;
}
