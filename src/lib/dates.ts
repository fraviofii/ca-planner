/** Dia contábil "AAAA-MM-DD" → Date à meia-noite UTC (o que guardamos no banco). */
export function dayToDate(day: string): Date {
  return new Date(`${day.slice(0, 10)}T00:00:00.000Z`);
}

/** Date do banco → "AAAA-MM-DD" (usando os componentes UTC, sem deslocar por fuso). */
export function dateToDay(d: Date | string): string {
  return (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" */
export function formatDay(day: string): string {
  const [y, m, d] = day.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function isValidDay(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** Hoje no fuso local, como "AAAA-MM-DD". */
export function todayDay(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Mês corrente no fuso local, como "AAAA-MM". */
export function currentMonth(): string {
  return todayDay().slice(0, 7);
}

export function isValidMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function addDays(day: string, delta: number): string {
  const d = dayToDate(day);
  d.setUTCDate(d.getUTCDate() + delta);
  return dateToDay(d);
}

/** Primeiro e último dia do mês "AAAA-MM". */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const nome = MESES[m - 1];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${y}`;
}
