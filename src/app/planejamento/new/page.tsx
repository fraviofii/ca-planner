"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { PlanForm, emptyPlanForm, signedCents, usePlanRefs, type PlanFormState } from "@/components/PlanForm";
import { currentMonth, formatMonth } from "@/lib/dates";

export default function NewPlanItemPage() {
  const router = useRouter();
  const month = currentMonth();
  const { groups, accounts } = usePlanRefs();
  const [form, setForm] = useState<PlanFormState>(() => emptyPlanForm(month));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.description.trim()) return setError("Informe a descrição.");
    if (!signedCents(form)) return setError("Informe o valor.");
    setBusy(true);
    try {
      await api("/api/plan", {
        method: "POST",
        body: JSON.stringify({
          day: form.day,
          description: form.description.trim(),
          amountCents: signedCents(form),
          categoryId: form.categoryId,
          accountId: form.accountId || null,
          paymentType: form.paymentType || null,
          status: form.status,
          recurrence: form.recurrence,
          endDay: form.recurrence === "NONE" ? null : form.endDay || null,
          notes: form.notes.trim() || null,
        }),
      });
      router.push("/planejamento");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Novo lançamento previsto</h1>
        <Link href="/planejamento" className="btn btn-sm">
          ‹ Voltar ao planejamento
        </Link>
      </header>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <section className="card">
        <PlanForm value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} groups={groups} accounts={accounts} month={month} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            Adicionar
          </button>
          <button className="btn" onClick={() => setForm(emptyPlanForm(month))} disabled={busy}>
            Limpar
          </button>
          <Link href="/planejamento" className="btn">
            Cancelar
          </Link>
          <span className="text-xs text-slate-500">Só é possível lançar dentro de {formatMonth(month).toLowerCase()}.</span>
        </div>
      </section>
    </div>
  );
}
