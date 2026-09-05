"use client";

import { formatMonth, monthRange, shiftMonth, todayDay } from "@/lib/dates";

export interface Period {
  mode: "month" | "range" | "all";
  month: string; // AAAA-MM
  from: string;
  to: string;
}

export function defaultPeriod(): Period {
  const month = todayDay().slice(0, 7);
  return { mode: "month", month, ...monthRange(month) };
}

/** Intervalo efetivo (from/to) ou vazio para "tudo". */
export function periodBounds(p: Period): { from?: string; to?: string } {
  if (p.mode === "all") return {};
  if (p.mode === "month") return monthRange(p.month);
  return { from: p.from, to: p.to };
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const setMonth = (month: string) => onChange({ ...value, mode: "month", month, ...monthRange(month) });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input" value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as Period["mode"] })}>
        <option value="month">Mês</option>
        <option value="range">Intervalo</option>
        <option value="all">Tudo</option>
      </select>

      {value.mode === "month" && (
        <div className="flex items-center gap-1">
          <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(value.month, -1))} aria-label="Mês anterior">
            ‹
          </button>
          <span className="min-w-40 text-center text-sm font-medium">{formatMonth(value.month)}</span>
          <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(value.month, 1))} aria-label="Próximo mês">
            ›
          </button>
        </div>
      )}

      {value.mode === "range" && (
        <div className="flex items-center gap-1 text-sm">
          <input type="date" className="input" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-slate-500">até</span>
          <input type="date" className="input" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
