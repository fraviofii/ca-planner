"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type AccountDto, type CategoryGroupDto, type PlanOccurrenceDto } from "@/lib/client";
import { CategorySelect } from "@/components/CategorySelect";
import { monthRange, todayDay } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { RECURRENCE_LABELS, type Recurrence } from "@/lib/plan";

/** Categorias e contas para os selects — as duas páginas do formulário precisam das mesmas. */
export function usePlanRefs() {
  const [groups, setGroups] = useState<CategoryGroupDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  useEffect(() => {
    api<{ groups: CategoryGroupDto[] }>("/api/categories").then((r) => setGroups(r.groups)).catch(() => {});
    api<{ accounts: AccountDto[] }>("/api/accounts").then((r) => setAccounts(r.accounts.filter((a) => !a.ignored))).catch(() => {});
  }, []);
  return { groups, accounts };
}

/** Estado do formulário de planejamento, compartilhado pelas páginas de criar e editar. */
export interface PlanFormState {
  kind: "out" | "in";
  day: string;
  description: string;
  value: string;
  categoryId: string | null;
  accountId: string;
  recurrence: Recurrence;
  endDay: string;
  notes: string;
}

export function emptyPlanForm(month: string): PlanFormState {
  const { from, to } = monthRange(month);
  const today = todayDay();
  return {
    kind: "out",
    day: today >= from && today <= to ? today : from,
    description: "",
    value: "",
    categoryId: null,
    accountId: "",
    recurrence: "NONE",
    endDay: "",
    notes: "",
  };
}

export function planFormFrom(o: PlanOccurrenceDto): PlanFormState {
  return {
    kind: o.amountCents < 0 ? "out" : "in",
    day: o.day,
    description: o.description,
    value: (Math.abs(o.amountCents) / 100).toFixed(2),
    categoryId: o.categoryId,
    accountId: o.accountId ?? "",
    recurrence: o.recurrence,
    endDay: o.seriesEndDay ?? "",
    notes: o.notes ?? "",
  };
}

/** Valor em centavos com o sinal do tipo escolhido: pagamento sai negativo. */
export function signedCents(form: Pick<PlanFormState, "kind" | "value">): number {
  const cents = Math.abs(toCents(form.value));
  return form.kind === "out" ? -cents : cents;
}

interface Props {
  value: PlanFormState;
  onChange: (patch: Partial<PlanFormState>) => void;
  groups: CategoryGroupDto[];
  accounts: AccountDto[];
  month: string;
  lockDay?: boolean;
  hideRecurrence?: boolean;
}

export function PlanForm({ value, onChange, groups, accounts, month, lockDay, hideRecurrence }: Props) {
  const bounds = useMemo(() => monthRange(month), [month]);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Tipo">
        <select className="input w-full" value={value.kind} onChange={(e) => onChange({ kind: e.target.value as PlanFormState["kind"] })}>
          <option value="out">Pagamento</option>
          <option value="in">Recebimento</option>
        </select>
      </Field>
      <Field label="Dia">
        <input
          type="date"
          className="input w-full"
          value={value.day}
          min={bounds.from}
          max={bounds.to}
          disabled={lockDay}
          title={lockDay ? "Para mudar o dia, exclua a ocorrência e lance de novo." : undefined}
          onChange={(e) => onChange({ day: e.target.value })}
        />
      </Field>
      <Field label="Descrição" className="lg:col-span-2">
        <input className="input w-full" placeholder="Aluguel, salário, escola…" value={value.description} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>
      <Field label="Valor (R$)">
        <input className="input w-full" inputMode="decimal" placeholder="0,00" value={value.value} onChange={(e) => onChange({ value: e.target.value })} />
      </Field>
      <Field label="Categoria">
        <CategorySelect groups={groups} value={value.categoryId} onChange={(id) => onChange({ categoryId: id })} className="w-full" />
      </Field>
      <Field label="Conta (opcional)">
        <select className="input w-full" value={value.accountId} onChange={(e) => onChange({ accountId: e.target.value })}>
          <option value="">Sem conta</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      {!hideRecurrence && (
        <Field label="Recorrência">
          <select className="input w-full" value={value.recurrence} onChange={(e) => onChange({ recurrence: e.target.value as Recurrence })}>
            {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
              <option key={r} value={r}>
                {RECURRENCE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!hideRecurrence && value.recurrence !== "NONE" && (
        <Field label="Repetir até (opcional)">
          <input type="date" className="input w-full" min={value.day} value={value.endDay} onChange={(e) => onChange({ endDay: e.target.value })} />
        </Field>
      )}
      <Field label="Observações" className="lg:col-span-2">
        <input className="input w-full" value={value.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      </Field>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
