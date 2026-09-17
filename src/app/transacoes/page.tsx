"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type AccountDto, type CategoryGroupDto, type SyncResultDto, type TransactionDto, type TransactionsResponse } from "@/lib/client";
import { Money } from "@/components/Money";
import { CategorySelect } from "@/components/CategorySelect";
import { PeriodPicker, defaultPeriod, periodBounds, type Period } from "@/components/PeriodPicker";
import { ExportDialog } from "@/components/ExportDialog";
import { formatDay, todayDay } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Carregando…</div>}>
      <TransactionsView />
    </Suspense>
  );
}

function TransactionsView() {
  const search = useSearchParams();
  const [period, setPeriod] = useState<Period>(() => (search.get("categoryId") === "none" ? { ...defaultPeriod(), mode: "all" } : defaultPeriod()));
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState(search.get("categoryId") ?? "");
  const [transfers, setTransfers] = useState<"include" | "exclude" | "only">("include");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [groups, setGroups] = useState<CategoryGroupDto[]>([]);
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<Array<{ ok: boolean; text: string }> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    api<{ accounts: AccountDto[] }>("/api/accounts").then((r) => setAccounts(r.accounts.filter((a) => !a.ignored))).catch(() => {});
    api<{ groups: CategoryGroupDto[] }>("/api/categories").then((r) => setGroups(r.groups)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    const b = periodBounds(period);
    if (b.from) params.set("from", b.from);
    if (b.to) params.set("to", b.to);
    if (accountId) params.set("accountId", accountId);
    if (categoryId) params.set("categoryId", categoryId);
    if (transfers !== "include") params.set("transfers", transfers);
    if (debouncedQ) params.set("q", debouncedQ);
    setLoading(true);
    try {
      setData(await api<TransactionsResponse>(`/api/transactions?${params}`));
      setError(null);
      setSelected(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [period, accountId, categoryId, transfers, debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  const patchLocal = (id: string, patch: Partial<TransactionDto>) =>
    setData((d) => (d ? { ...d, transactions: d.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)) } : d));

  const categoryRef = useMemo(() => {
    const map = new Map<string, TransactionDto["category"]>();
    for (const g of groups) for (const c of g.categories) map.set(c.id, { id: c.id, name: c.name, group: { id: g.id, name: g.name } });
    return map;
  }, [groups]);

  async function setCategory(t: TransactionDto, id: string | null) {
    patchLocal(t.id, { categoryId: id, category: id ? categoryRef.get(id) ?? null : null });
    try {
      await api(`/api/transactions/${t.id}`, { method: "PATCH", body: JSON.stringify({ categoryId: id }) });
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  }

  async function toggleTransfer(t: TransactionDto) {
    patchLocal(t.id, { isTransfer: !t.isTransfer });
    try {
      await api(`/api/transactions/${t.id}`, { method: "PATCH", body: JSON.stringify({ isTransfer: !t.isTransfer }) });
      // totais mudam: recarrega em silêncio
      load();
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  }

  /**
   * Sincroniza todas as conexões no período da tela — o normal é querer atualizar
   * justamente o que se está olhando. Sem período (modo "Tudo"), ou com um período que
   * ainda não aconteceu, cai nos últimos 30 dias, como a tela de Conexões.
   */
  async function syncAll() {
    setSyncing(true);
    setSyncLog(null);
    try {
      const r = await api<{ results: SyncResultDto[] }>("/api/connections/sync-all", { method: "POST", body: JSON.stringify(syncPeriod(period)) });
      setSyncLog(
        r.results.length
          ? r.results.map((x) => ({
              ok: x.ok,
              text: x.ok
                ? `${x.nickname}: ${x.created} novo(s), ${x.updated} atualizado(s) em ${x.accounts} conta(s).`
                : `${x.nickname}: falhou — ${x.error}`,
            }))
          : [{ ok: true, text: "Nenhuma conexão cadastrada. Cadastre em Configurações › Conexões." }],
      );
      setError(null);
      await load();
    } catch (e) {
      setError(`Sincronização falhou — ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function applyBulk(patch: { categoryId?: string | null; isTransfer?: boolean }) {
    if (!selected.size) return;
    try {
      await api("/api/transactions/bulk", { method: "POST", body: JSON.stringify({ ids: [...selected], ...patch }) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // O diálogo de exportação abre com o recorte da tela; lá dentro dá para somar contas.
  const exportInitial = useMemo(() => {
    const b = periodBounds(period);
    return { from: b.from ?? "", to: b.to ?? "", accountIds: accountId ? [accountId] : [], categoryId, transfers, q };
  }, [period, accountId, categoryId, transfers, q]);

  const rows = data?.transactions ?? [];
  const balances = data?.balances ?? null;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker value={period} onChange={setPeriod} />
          <button className="btn" onClick={syncAll} disabled={syncing} title={`Buscar lançamentos novos na Pluggy (${describeSyncPeriod(period)})`}>
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
          <button className="btn" onClick={() => setExporting(true)}>
            Exportar
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Todas as categorias</option>
          <option value="none">Sem categoria</option>
          {groups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {g.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select className="input" value={transfers} onChange={(e) => setTransfers(e.target.value as typeof transfers)}>
          <option value="include">Com transferências</option>
          <option value="exclude">Sem transferências</option>
          <option value="only">Só transferências</option>
        </select>
        <input className="input min-w-64 flex-1" placeholder="Buscar na descrição, contraparte ou notas…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {exporting && (
        <ExportDialog
          accounts={accounts}
          groups={groups}
          initial={exportInitial}
          onClose={() => setExporting(false)}
        />
      )}

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {syncLog && (
        <div
          className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${
            syncLog.every((l) => l.ok) ? "border-sky-200 bg-sky-50 text-sky-900" : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <ul className="space-y-0.5">
            {syncLog.map((line, i) => (
              <li key={i} className={line.ok ? "" : "font-medium text-rose-700"}>
                {line.text}
              </li>
            ))}
          </ul>
          <button className="btn btn-sm" onClick={() => setSyncLog(null)}>
            Fechar
          </button>
        </div>
      )}

      {data && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-600">
          <span>
            <strong>{data.totals.count}</strong> lançamento(s)
            {data.totals.count > data.totals.shown && <span className="text-amber-700"> (mostrando os {data.totals.shown} mais recentes)</span>}
          </span>
          <span>
            Receitas <Money cents={data.totals.incomeCents} />
          </span>
          <span>
            Despesas <Money cents={data.totals.expenseCents} />
          </span>
          <span>
            Resultado <Money cents={data.totals.netCents} />
          </span>
          <span className="text-xs text-slate-400">transferências fora dos totais</span>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50 p-2 text-sm">
          <span className="font-medium text-sky-800">{selected.size} selecionado(s)</span>
          <CategorySelect groups={groups} value={bulkCategory} onChange={setBulkCategory} placeholder="Escolha a categoria…" />
          <button className="btn btn-sm btn-primary" onClick={() => applyBulk({ categoryId: bulkCategory })}>
            Aplicar categoria
          </button>
          <button className="btn btn-sm" onClick={() => applyBulk({ isTransfer: true })}>
            Marcar transferência
          </button>
          <button className="btn btn-sm" onClick={() => applyBulk({ isTransfer: false })}>
            Desmarcar transferência
          </button>
          <button className="btn btn-sm" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
              </th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Conta</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2 text-right">Valor</th>
              {balances && (
                <th
                  className="px-3 py-2 text-right"
                  title={`Saldo no fim do dia${balances.accountCount > 1 ? `, somando as ${balances.accountCount} contas` : ""}. Vem do saldo atual da conta menos os lançamentos posteriores, então não muda com os filtros da tela.`}
                >
                  Saldo
                </th>
              )}
              <th className="px-3 py-2 text-center">Transf.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((t, i) => (
              <tr key={t.id} className={`${t.isTransfer ? "text-slate-400" : ""} ${selected.has(t.id) ? "bg-sky-50/60" : "hover:bg-slate-50"}`}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} aria-label="Selecionar" />
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDay(t.day)}</td>
                <td className="max-w-36 truncate px-3 py-2" title={t.account.name}>
                  {t.account.name}
                </td>
                <td className="px-3 py-2">
                  <div className="max-w-xl truncate" title={t.description}>
                    {t.description}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                    {t.counterparty && t.counterparty !== t.description && <span className="truncate">{t.counterparty}</span>}
                    {t.providerCategory && <span title="Sugestão da Pluggy">Pluggy: {t.providerCategory}</span>}
                    {t.status === "PENDING" && <span className="badge bg-amber-100 text-amber-800">pendente</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <CategorySelect
                    groups={groups}
                    value={t.categoryId}
                    onChange={(id) => setCategory(t, id)}
                    className={`w-full max-w-56 ${!t.categoryId && !t.isTransfer ? "border-amber-300 bg-amber-50" : ""}`}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  <Money cents={t.amountCents} signed={!t.isTransfer} />
                </td>
                {balances && (
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {i === 0 || rows[i - 1].day !== t.day ? (
                      <span
                        className={`tabular-nums ${balances.byDay[t.day] < 0 ? "money-neg" : "text-slate-600"}`}
                        title={`Saldo no fim de ${formatDay(t.day)}`}
                      >
                        {balances.byDay[t.day] === undefined ? "—" : formatCents(balances.byDay[t.day])}
                      </span>
                    ) : null}
                  </td>
                )}
                <td className="px-3 py-2 text-center">
                  <button
                    className={`badge cursor-pointer ${t.isTransfer ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    title={t.isTransfer ? "Marcada como transferência entre contas próprias (fora dos totais). Clique para desmarcar." : "Marcar como transferência entre contas próprias"}
                    onClick={() => toggleTransfer(t)}
                  >
                    {t.isTransfer ? "sim" : "não"}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={balances ? 8 : 7} className="px-3 py-8 text-center text-slate-500">
                  Nenhum lançamento com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Período que a sincronização deve buscar, a partir do que está na tela. */
function syncPeriod(period: Period): { from: string; to: string } | { days: number } {
  const b = periodBounds(period);
  const today = todayDay();
  const to = b.to && b.to < today ? b.to : today;
  // Nada a buscar no futuro; e sem início definido a Pluggy precisa de um limite.
  if (!b.from || b.from > to) return { days: 30 };
  return { from: b.from, to };
}

function describeSyncPeriod(period: Period): string {
  const p = syncPeriod(period);
  return "days" in p ? `últimos ${p.days} dias` : `${formatDay(p.from)} a ${formatDay(p.to)}`;
}
