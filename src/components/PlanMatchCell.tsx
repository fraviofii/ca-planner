"use client";

import { useState } from "react";
import type { PlanMatchDto, PlanOptionDto } from "@/lib/client";
import { formatDay } from "@/lib/dates";
import { formatCents } from "@/lib/money";

/**
 * Coluna "no plano?": mostra o vínculo de uma transação com o planejamento — palpite (≈)
 * ou marcação sua (✓) — e abre o seletor só quando você clica, para a tabela seguir
 * legível. Usada no fluxo de caixa e na lista de transações.
 *
 * `onChange` recebe "" (não estava no plano), "auto" (voltar ao palpite) ou "itemId|dia".
 *
 * O seletor oferece só o que ainda faz sentido escolher: ocorrências do mês da
 * transação (`day`) que nenhuma outra transação já cumpre — mais a que esta própria
 * linha já tem, para a seleção atual continuar visível.
 */
export function PlanMatchCell({
  transactionId,
  day,
  plan,
  options,
  onChange,
}: {
  transactionId: string;
  day?: string;
  plan: PlanMatchDto | null;
  options: PlanOptionDto[];
  onChange: (transactionId: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    const month = day?.slice(0, 7);
    const available = options.filter((o) => (!month || o.day.startsWith(month)) && (!o.takenBy || o.takenBy === transactionId));
    return (
      <span className="flex items-center gap-1">
        <select
          className="input max-w-48 py-1 text-xs"
          defaultValue={plan ? `${plan.itemId}|${plan.day}` : ""}
          autoFocus
          onChange={(e) => {
            setEditing(false);
            onChange(transactionId, e.target.value);
          }}
        >
          <option value="">não estava no plano</option>
          {available.length === 0 && (
            <option value="" disabled>
              (nenhuma ocorrência livre no mês)
            </option>
          )}
          {available.map((o) => (
            <option key={`${o.itemId}|${o.day}`} value={`${o.itemId}|${o.day}`}>
              {o.description} · {formatDay(o.day).slice(0, 5)} · {formatCents(o.amountCents)}
            </option>
          ))}
        </select>
        <button className="text-xs text-slate-400 hover:text-slate-700" title="Cancelar" onClick={() => setEditing(false)}>
          ×
        </button>
      </span>
    );
  }

  if (!plan) {
    return (
      <button className="text-xs text-slate-400 underline-offset-2 hover:text-sky-700 hover:underline" onClick={() => setEditing(true)}>
        marcar…
      </button>
    );
  }

  const quando = plan.dayDiff ? `${Math.abs(plan.dayDiff)} dia(s) ${plan.dayDiff > 0 ? "depois" : "antes"} do previsto` : "no dia previsto";
  return (
    <span className="flex items-center gap-1">
      <button
        className={`badge max-w-44 truncate ${plan.source === "auto" ? "bg-emerald-50 text-emerald-700" : "bg-emerald-100 text-emerald-800"} hover:bg-emerald-200`}
        title={`${plan.source === "auto" ? "Casado automaticamente" : "Marcado por você"}: ${plan.description}, previsto para ${formatDay(plan.day)} — ${quando}. Clique para mudar.`}
        onClick={() => setEditing(true)}
      >
        {plan.source === "auto" ? "≈" : "✓"} {plan.description}
      </button>
      {plan.source === "manual" && (
        <button className="text-xs text-slate-400 hover:text-slate-700" title="Voltar ao palpite automático" onClick={() => onChange(transactionId, "auto")}>
          ↺
        </button>
      )}
    </span>
  );
}

