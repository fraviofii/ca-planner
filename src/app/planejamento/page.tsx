"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type PlanOccurrenceDto, type PlanResponse } from "@/lib/client";
import { Money } from "@/components/Money";
import { MonthPicker } from "@/components/MonthPicker";
import { currentMonth, formatDay, formatMonth } from "@/lib/dates";
import { RECURRENCE_LABELS } from "@/lib/plan";

export default function PlanningPage() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<PlanResponse | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PlanOccurrenceDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isCurrent = month === currentMonth();

  const load = useCallback(async () => {
    try {
      setData(await api<PlanResponse>(`/api/plan?month=${month}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [month]);

  useEffect(() => {
    load();
    setConfirmDelete(null);
  }, [load]);

  async function remove(o: PlanOccurrenceDto, scope: "one" | "future") {
    setBusy(true);
    try {
      await api(`/api/plan/${o.itemId}?day=${o.day}&scope=${scope}`, { method: "DELETE" });
      setConfirmDelete(null);
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const totals = data?.totals;
  const maxExpense = Math.max(1, ...(data?.groups.map((g) => Math.abs(g.expenseCents)) ?? [1]));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Planejamento</h1>
          {!isCurrent && <span className="badge bg-slate-100 text-slate-600">somente leitura</span>}
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} />
          {isCurrent ? (
            <Link href="/planejamento/new" className="btn btn-primary">
              Novo lançamento
            </Link>
          ) : (
            <button className="btn btn-sm" onClick={() => setMonth(currentMonth())}>
              Mês atual
            </button>
          )}
        </div>
      </header>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {totals && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card label="Receitas previstas" value={<Money cents={totals.incomeCents} />} />
          <Card label="Pagamentos previstos" value={<Money cents={totals.expenseCents} />} />
          <Card label="Resultado previsto" value={<Money cents={totals.netCents} />} />
        </section>
      )}

      {!isCurrent && (
        <div className="card text-sm text-slate-600">
          Este mês é só de leitura: as ocorrências vêm das recorrências lançadas no mês corrente. Para mudar alguma coisa, volte ao{" "}
          <button className="text-sky-700 underline-offset-2 hover:underline" onClick={() => setMonth(currentMonth())}>
            mês atual
          </button>
          .
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card overflow-x-auto p-0 lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Dia</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2">Conta</th>
                <th className="px-3 py-2 text-right">Valor</th>
                {isCurrent && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.occurrences ?? []).map((o) => (
                <tr key={`${o.itemId}:${o.day}`} className="align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDay(o.day)}</td>
                  <td className="px-3 py-2">
                    <div className="max-w-md truncate" title={o.description}>
                      {o.description}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      {o.recurrence !== "NONE" && (
                        <span className="badge bg-violet-100 text-violet-700" title={o.seriesEndDay ? `Até ${formatDay(o.seriesEndDay)}` : "Sem data-fim"}>
                          {RECURRENCE_LABELS[o.recurrence].toLowerCase()}
                        </span>
                      )}
                      {o.overridden && <span className="badge bg-amber-100 text-amber-800">alterada</span>}
                      {o.notes && <span className="truncate">{o.notes}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {o.category ? (
                      <span className="text-slate-600">
                        {o.category.group.name} · {o.category.name}
                      </span>
                    ) : (
                      <span className="text-amber-700">Sem categoria</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{o.account?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    <Money cents={o.amountCents} />
                  </td>
                  {isCurrent && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {confirmDelete?.itemId === o.itemId && confirmDelete.day === o.day ? (
                        <div className="flex flex-wrap justify-end gap-1">
                          <button className="btn btn-sm btn-danger" onClick={() => remove(o, "one")} disabled={busy}>
                            {o.recurrence === "NONE" ? "Excluir" : "Só esta"}
                          </button>
                          {o.recurrence !== "NONE" && (
                            <button className="btn btn-sm btn-danger" onClick={() => remove(o, "future")} disabled={busy}>
                              Esta e as futuras
                            </button>
                          )}
                          <button className="btn btn-sm" onClick={() => setConfirmDelete(null)} disabled={busy}>
                            Não
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Link className="btn btn-sm" href={`/planejamento/edit?item=${o.itemId}&day=${o.day}`}>
                            Editar
                          </Link>
                          <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(o)}>
                            Excluir
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {data && data.occurrences.length === 0 && (
                <tr>
                  <td colSpan={isCurrent ? 6 : 5} className="px-3 py-8 text-center text-slate-500">
                    Nada planejado para {formatMonth(month).toLowerCase()}.
                    {isCurrent && (
                      <>
                        {" "}
                        <Link href="/planejamento/new" className="text-sky-700 underline-offset-2 hover:underline">
                          Lançar o primeiro
                        </Link>
                        .
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="space-y-5">
          <section className="card">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Por categoria</h2>
            {data?.groups.length ? (
              <div className="space-y-2">
                {data.groups.map((g) => (
                  <details key={g.id ?? "none"} className="group" open={g.categories.length > 1}>
                    <summary className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                      <span className="w-28 shrink-0 truncate font-medium">{g.name}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded bg-slate-100">
                        <span
                          className={`block h-full ${g.id === null ? "bg-amber-400" : "bg-rose-400"}`}
                          style={{ width: `${(Math.abs(g.expenseCents) / maxExpense) * 100}%` }}
                        />
                      </span>
                      <span className="w-24 text-right">
                        <Money cents={g.expenseCents + g.incomeCents} />
                      </span>
                    </summary>
                    <ul className="mb-1 ml-3 border-l border-slate-200 pl-3">
                      {g.categories.map((c) => (
                        <li key={c.id ?? "none"} className="flex items-center justify-between gap-2 py-0.5 text-sm text-slate-600">
                          <span className="truncate">{c.name}</span>
                          <Money cents={c.expenseCents + c.incomeCents} />
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sem lançamentos previstos.</p>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Por conta</h2>
            {data?.accounts.length ? (
              <ul className="divide-y divide-slate-100">
                {data.accounts.map((a) => (
                  <li key={a.id ?? "none"} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${a.id ? "" : "text-slate-500"}`}>{a.name}</span>
                      <Money cents={a.incomeCents + a.expenseCents} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>
                        <Money cents={a.incomeCents} /> · <Money cents={a.expenseCents} />
                      </span>
                      <span>{a.count} lanç.</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Sem lançamentos previstos.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
