"use client";

import { formatMonth, shiftMonth } from "@/lib/dates";

/** Navegação mês a mês — o planejamento não tem outros modos de período. */
export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button className="btn btn-sm" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Mês anterior">
        ‹
      </button>
      <span className="min-w-40 text-center text-sm font-medium">{formatMonth(value)}</span>
      <button className="btn btn-sm" onClick={() => onChange(shiftMonth(value, 1))} aria-label="Próximo mês">
        ›
      </button>
    </div>
  );
}
