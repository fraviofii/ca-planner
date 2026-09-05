"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type AccountDto, type SummaryResponse } from "@/lib/client";
import { Money } from "@/components/Money";
import { PeriodPicker, defaultPeriod, periodBounds, type Period } from "@/components/PeriodPicker";
import { formatCents } from "@/lib/money";

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ accounts: AccountDto[] }>("/api/accounts").then((r) => setAccounts(r.accounts.filter((a) => !a.ignored))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    const b = periodBounds(period);
    if (b.from) q.set("from", b.from);
    if (b.to) q.set("to", b.to);
    if (accountId) q.set("accountId", accountId);
    try {
      setData(await api<SummaryResponse>(`/api/summary?${q}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [period, accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = data?.totals;
  const maxExpense = Math.max(1, ...(data?.groups.map((g) => Math.abs(g.expenseCents)) ?? [1]));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker value={period} onChange={setPeriod} />
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {totals && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Card label="Receitas" value={<Money cents={totals.incomeCents} />} />
          <Card label="Despesas" value={<Money cents={totals.expenseCents} />} />
          <Card label="Resultado" value={<Money cents={totals.netCents} />} />
          <Card label="Transferências (fora dos totais)" value={<span className="tabular-nums text-slate-600">{formatCents(totals.transferCents)}</span>} />
          <Card
            label="Sem categoria"
            value={
              totals.uncategorized ? (
                <Link href="/transacoes?categoryId=none" className="text-amber-700 underline-offset-2 hover:underline">
                  {totals.uncategorized} lançamento(s)
                </Link>
              ) : (
                <span className="text-emerald-700">tudo categorizado</span>
              )
            }
          />
        </section>
      )}

      {data && data.totals.count === 0 && (
        <div className="card text-sm text-slate-600">
          Nenhum lançamento no período. Sincronize uma conexão ou importe os JSON da skill em{" "}
          <Link href="/conexoes" className="text-sky-700 underline-offset-2 hover:underline">
            Conexões
          </Link>
          .
        </div>
      )}

      {data && data.totals.count > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Por categoria</h2>
            <div className="space-y-3">
              {data.groups.map((g) => (
                <details key={g.id ?? "none"} className="group" open={g.id === null}>
                  <summary className="flex cursor-pointer items-center gap-3 py-1 text-sm">
                    <span className="w-44 shrink-0 truncate font-medium">{g.name}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded bg-slate-100">
                      <span
                        className={`block h-full ${g.id === null ? "bg-amber-400" : "bg-rose-400"}`}
                        style={{ width: `${(Math.abs(g.expenseCents) / maxExpense) * 100}%` }}
                      />
                    </span>
                    <span className="w-32 text-right">
                      <Money cents={g.expenseCents} />
                    </span>
                    <span className="w-28 text-right">
                      <Money cents={g.incomeCents} />
                    </span>
                    <span className="w-10 text-right text-xs text-slate-500">{g.count}</span>
                  </summary>
                  <ul className="mb-2 ml-4 border-l border-slate-200 pl-4">
                    {g.categories.map((c) => (
                      <li key={c.id ?? "none"} className="flex items-center gap-3 py-0.5 text-sm text-slate-600">
                        <span className="w-40 shrink-0 truncate">{c.name}</span>
                        <span className="flex-1" />
                        <span className="w-32 text-right">
                          <Money cents={c.expenseCents} />
                        </span>
                        <span className="w-28 text-right">
                          <Money cents={c.incomeCents} />
                        </span>
                        <span className="w-10 text-right text-xs text-slate-400">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
            <div className="mt-2 flex justify-end gap-3 text-xs text-slate-400">
              <span className="w-32 text-right">despesas</span>
              <span className="w-28 text-right">receitas</span>
              <span className="w-10 text-right">qtd</span>
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Por conta</h2>
            <ul className="divide-y divide-slate-100">
              {data.accounts.map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.name}</span>
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
            {accounts.some((a) => a.balanceCents != null) && (
              <>
                <h2 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">Saldo atual (Pluggy)</h2>
                <ul className="divide-y divide-slate-100">
                  {accounts
                    .filter((a) => a.balanceCents != null)
                    .map((a) => (
                      <li key={a.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span>{a.name}</span>
                        <Money cents={a.balanceCents!} />
                      </li>
                    ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
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
