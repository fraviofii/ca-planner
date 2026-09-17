"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type PlanOccurrenceDto, type PlanOccurrenceResponse } from "@/lib/client";
import { PlanForm, planFormFrom, signedCents, usePlanRefs, type PlanFormState } from "@/components/PlanForm";
import { formatDay } from "@/lib/dates";
import { RECURRENCE_LABELS } from "@/lib/plan";

export default function EditPlanItemPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Carregando…</div>}>
      <EditPlanItemView />
    </Suspense>
  );
}

function EditPlanItemView() {
  const router = useRouter();
  const search = useSearchParams();
  const itemId = search.get("item") ?? "";
  const day = search.get("day") ?? "";

  const { groups, accounts } = usePlanRefs();
  const [occurrence, setOccurrence] = useState<PlanOccurrenceDto | null>(null);
  const [editable, setEditable] = useState(true);
  const [form, setForm] = useState<PlanFormState | null>(null);
  const [scope, setScope] = useState<"one" | "future">("one");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!itemId || !day) return setError("Link inválido: falta o item ou o dia.");
    try {
      const r = await api<PlanOccurrenceResponse>(`/api/plan/${itemId}?day=${day}`);
      setOccurrence(r.occurrence);
      setEditable(r.editable);
      setForm(planFormFrom(r.occurrence));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [itemId, day]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!form || !occurrence) return;
    if (!form.description.trim()) return setError("Informe a descrição.");
    if (!signedCents(form)) return setError("Informe o valor.");
    // A regra (recorrência e fim) só é tocada quando a alteração vale para as futuras.
    const touchesSeries = occurrence.recurrence === "NONE" || scope === "future";
    setBusy(true);
    try {
      await api(`/api/plan/${occurrence.itemId}`, {
        method: "PATCH",
        body: JSON.stringify({
          day: occurrence.day,
          scope,
          description: form.description.trim(),
          amountCents: signedCents(form),
          categoryId: form.categoryId,
          accountId: form.accountId || null,
          paymentType: form.paymentType || null,
          status: form.status,
          notes: form.notes.trim() || null,
          ...(touchesSeries ? { recurrence: form.recurrence, endDay: form.recurrence === "NONE" ? null : form.endDay || null } : {}),
        }),
      });
      router.push("/planejamento");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const recurring = occurrence?.recurrence !== "NONE";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Editar lançamento previsto</h1>
          {occurrence && (
            <p className="text-sm text-slate-500">
              {occurrence.description} · {formatDay(occurrence.day)}
              {recurring && ` · ${RECURRENCE_LABELS[occurrence.recurrence].toLowerCase()}`}
            </p>
          )}
        </div>
        <Link href="/planejamento" className="btn btn-sm">
          ‹ Voltar ao planejamento
        </Link>
      </header>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {occurrence && !editable && (
        <div className="card text-sm text-slate-600">
          Este lançamento é de {formatDay(occurrence.day)}, fora do mês corrente — o planejamento dos outros meses é só de leitura.
        </div>
      )}

      {form && occurrence && editable && (
        <section className="card">
          {recurring && (
            <div className="mb-4 flex flex-wrap items-center gap-4 rounded-md bg-slate-50 p-3 text-sm">
              <span className="font-medium text-slate-600">A alteração vale para:</span>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scope === "one"} onChange={() => setScope("one")} />
                Só esta ocorrência
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scope === "future"} onChange={() => setScope("future")} />
                Esta e as futuras
              </label>
            </div>
          )}
          <PlanForm
            value={form}
            onChange={(patch) => setForm({ ...form, ...patch })}
            groups={groups}
            accounts={accounts}
            month={occurrence.day.slice(0, 7)}
            lockDay
            hideRecurrence={recurring && scope === "one"}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              Salvar
            </button>
            <Link href="/planejamento" className="btn">
              Cancelar
            </Link>
            <span className="text-xs text-slate-500">Para mudar o dia, exclua a ocorrência e lance de novo.</span>
          </div>
        </section>
      )}
    </div>
  );
}
