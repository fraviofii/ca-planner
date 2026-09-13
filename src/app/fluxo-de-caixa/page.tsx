"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type AccountDto, type CashFlowEntryDto, type CashFlowResponse } from "@/lib/client";
import { CashFlowChart } from "@/components/CashFlowChart";
import { Money } from "@/components/Money";
import { formatDay, formatMonth } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export default function CashFlowPage() {
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [data, setData] = useState<CashFlowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ accounts: AccountDto[] }>("/api/accounts").then((r) => setAccounts(r.accounts.filter((a) => !a.ignored))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<CashFlowResponse>(`/api/cashflow${accountId ? `?accountId=${accountId}` : ""}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Marca à mão (ou desmarca) que uma transação cumpriu um item previsto. */
  async function setMatch(transactionId: string, value: string) {
    try {
      if (value === "auto") await api(`/api/plan-match?transactionId=${transactionId}`, { method: "DELETE" });
      else {
        const [itemId, day] = value ? value.split("|") : [null, null];
        await api("/api/plan-match", { method: "PUT", body: JSON.stringify({ transactionId, itemId, day }) });
      }
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const s = data?.summary;
  const consolidated = !accountId;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fluxo de caixa</h1>
          <p className="text-sm text-slate-500">
            {data ? `${formatMonth(data.month)} · real até ${formatDay(data.today)}, previsto depois` : "Carregando…"}
          </p>
        </div>
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Consolidado (todas as contas)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </header>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {data && !data.available && (
        <div className="card text-sm text-slate-600">
          {data.reason} Sem saldo não dá para desenhar a curva: sincronize a conexão em{" "}
          <Link href="/configuracoes/conexoes" className="text-sky-700 underline-offset-2 hover:underline">
            Conexões
          </Link>
          .
        </div>
      )}

      {s && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card label="Saldo hoje" value={<Money cents={s.todayCents} signed={false} />} />
          <Card label="Saldo previsto no fim do mês" value={<Money cents={s.endCents} />} />
          <Card
            label="A receber / a pagar"
            value={
              <span className="flex flex-col text-base leading-tight">
                <Money cents={s.plannedIncomeCents} />
                <Money cents={s.plannedExpenseCents} />
              </span>
            }
          />
          <Card
            label="Menor saldo do mês"
            value={
              <span className="flex items-baseline gap-2">
                <Money cents={s.lowestCents} signed={s.lowestCents < 0} />
                <span className="text-xs font-normal text-slate-500">{formatDay(s.lowestDay)}</span>
              </span>
            }
          />
        </section>
      )}

      {data?.available && (
        <section className={`card transition-opacity ${loading ? "opacity-60" : ""}`}>
          <CashFlowChart days={data.days} today={data.today} />
        </section>
      )}

      {s && (s.ignoredPlan.count > 0 || s.unassignedPlan.count > 0) && (
        <div className="card space-y-1 text-sm text-slate-600">
          {s.ignoredPlan.count > 0 && (
            <p>
              <strong>{s.ignoredPlan.count}</strong> item(ns) previsto(s) para antes de hoje ({formatCents(s.ignoredPlan.cents)}) ficaram de fora da
              projeção: até hoje a curva usa o que aconteceu de verdade, então somá-los contaria duas vezes o que já foi pago.
            </p>
          )}
          {s.unassignedPlan.count > 0 && (
            <p>
              <strong>{s.unassignedPlan.count}</strong> item(ns) previsto(s) sem conta definida ({formatCents(s.unassignedPlan.cents)}) não entram na
              curva de uma conta só — aparecem no consolidado. Defina a conta em{" "}
              <Link href="/planejamento" className="text-sky-700 underline-offset-2 hover:underline">
                Planejamento
              </Link>{" "}
              para vê-los aqui.
            </p>
          )}
        </div>
      )}

      {data?.available && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-500">Ver em tabela</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dia</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Conta</th>
                  <th className="px-3 py-2" title="A transação cumpriu algum item do planejamento? O palpite é por valor igual até 3 dias de distância, na mesma conta; você pode corrigir.">
                    No plano?
                  </th>
                  <th className="px-3 py-2 text-right">Movimento</th>
                  <th className="px-3 py-2 text-right">Saldo no fim do dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.days
                  .filter((d) => d.entries.length)
                  .flatMap((d) =>
                    // O dia e o saldo aparecem uma vez por dia, na primeira linha do bloco.
                    d.entries.map((entry, i) => (
                      <tr key={`${d.day}:${i}`} className={d.day === data.today ? "bg-sky-50/60" : ""}>
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{i === 0 ? formatDay(d.day) : ""}</td>
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-2">
                            <span className="max-w-sm truncate" title={entry.description}>
                              {entry.description}
                            </span>
                            {d.projected && <span className="badge shrink-0 bg-violet-100 text-violet-700">previsto</span>}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-600">{entry.accountName ?? <span className="text-slate-400">sem conta</span>}</td>
                        <td className="px-3 py-1.5">
                          {d.projected ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <PlanMatchCell entry={entry} options={data.planOptions} onChange={setMatch} />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right">
                          <Money cents={entry.amountCents} />
                        </td>
                        <td className={`whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums ${d.balanceCents < 0 ? "money-neg" : ""}`}>
                          {i === 0 ? formatCents(d.balanceCents) : ""}
                        </td>
                      </tr>
                    )),
                  )}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {data?.available && (
        <p className="text-xs text-slate-400">
          {consolidated
            ? `Consolidado de ${data.scope.accountCount} conta(s).`
            : `Conta ${data.scope.accountName}.`}{" "}
          O saldo vem do saldo atual informado pela Pluggy, para trás descontando os lançamentos e para frente somando o planejamento.
        </p>
      )}
    </div>
  );
}

/**
 * Coluna "no plano?": mostra o vínculo com o planejamento — palpite (≈) ou marcação
 * sua (✓) — e abre o seletor só quando você clica, para a tabela seguir legível.
 */
function PlanMatchCell({
  entry,
  options,
  onChange,
}: {
  entry: CashFlowEntryDto;
  options: CashFlowResponse["planOptions"];
  onChange: (transactionId: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const plan = entry.plan;
  const transactionId = entry.transactionId;
  if (!transactionId) return <span className="text-slate-300">—</span>;

  if (editing) {
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
          {options.map((o) => (
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

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
