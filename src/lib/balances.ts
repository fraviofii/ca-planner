/**
 * Saldo das contas ao longo do tempo.
 *
 * Tudo aqui ancora no saldo atual informado pela Pluggy e desconta os lançamentos
 * posteriores ao dia que se quer saber. Ou seja: o saldo não depende de filtro nenhum
 * de tela, só do histórico gravado — e, pelo mesmo motivo, erra para trás se faltar
 * lançamento no meio do histórico.
 */

import { prisma } from "@/lib/prisma";
import { addDays, dateToDay, dayToDate } from "@/lib/dates";

export interface BalanceScope {
  accountIds: string[];
  anchorCents: number; // soma dos saldos atuais das contas em jogo
  accountCount: number;
}

export interface DayMovement {
  day: string;
  cents: number;
}

/**
 * Contas em jogo (uma só ou todas as não ignoradas) e a âncora do cálculo.
 * Devolve null quando falta saldo em alguma delas: sem âncora não há saldo honesto.
 */
export async function balanceScope(accountId: string | null): Promise<BalanceScope | null> {
  const accounts = await prisma.account.findMany({
    where: accountId ? { id: accountId } : { ignored: false },
    select: { id: true, balanceCents: true },
  });
  if (!accounts.length || accounts.some((a) => a.balanceCents === null)) return null;
  return {
    accountIds: accounts.map((a) => a.id),
    anchorCents: accounts.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0),
    accountCount: accounts.length,
  };
}

/** Soma dos lançamentos por dia, de `fromDay` em diante, do mais novo para o mais antigo. */
export async function movementsByDay(accountIds: string[], fromDay: string): Promise<DayMovement[]> {
  const rows = await prisma.transaction.groupBy({
    by: ["date"],
    where: { accountId: { in: accountIds }, date: { gte: dayToDate(fromDay) } },
    _sum: { amountCents: true },
    orderBy: { date: "desc" },
  });
  return rows.map((r) => ({ day: dateToDay(r.date), cents: r._sum.amountCents ?? 0 }));
}

/** Saldo no fim de cada dia que teve movimento — o que a lista de transações precisa. */
export function closingBalances(anchorCents: number, movements: DayMovement[]): Record<string, number> {
  const byDay: Record<string, number> = {};
  let afterCents = 0; // os dias já percorridos são todos posteriores ao atual
  for (const m of movements) {
    byDay[m.day] = anchorCents - afterCents;
    afterCents += m.cents;
  }
  return byDay;
}

/** Saldo no fim de todo dia de [fromDay, toDay] — inclusive os dias parados. */
export function dailyBalances(anchorCents: number, movements: DayMovement[], fromDay: string, toDay: string) {
  const byDay = new Map(movements.map((m) => [m.day, m.cents]));
  const afterCents = movements.filter((m) => m.day > toDay).reduce((sum, m) => sum + m.cents, 0);

  const out: Array<{ day: string; balanceCents: number; movementCents: number }> = [];
  let balanceCents = anchorCents - afterCents; // saldo no fim de toDay
  for (let day = toDay; day >= fromDay; day = addDays(day, -1)) {
    const movementCents = byDay.get(day) ?? 0;
    out.push({ day, balanceCents, movementCents });
    balanceCents -= movementCents; // andando para trás, desfaz o movimento do dia
  }
  return out.reverse();
}
