"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccountDto, CategoryGroupDto } from "@/lib/client";
import { ApiError } from "@/lib/client";

export type ExportFormat = "xlsx" | "csv" | "pdf";

const FORMATS: Array<{ id: ExportFormat; label: string; hint: string }> = [
  { id: "xlsx", label: "Excel (.xlsx)", hint: "Planilha com filtros e aba de resumo" },
  { id: "csv", label: "CSV (.csv)", hint: "Texto separado por ponto e vírgula" },
  { id: "pdf", label: "PDF (.pdf)", hint: "Relatório pronto para imprimir" },
];

export interface ExportFilters {
  from: string;
  to: string;
  accountIds: string[];
  categoryId: string;
  transfers: "include" | "exclude" | "only";
  q: string;
}

/**
 * Escolhe formato, contas e período e baixa o arquivo.
 *
 * Abre já com o que está na tela de Transações; daqui o usuário pode somar contas,
 * mudar o intervalo ou limpar os filtros antes de exportar.
 */
export function ExportDialog({
  accounts,
  groups,
  initial,
  onClose,
}: {
  accounts: AccountDto[];
  groups: CategoryGroupDto[];
  initial: ExportFilters;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [filters, setFilters] = useState<ExportFilters>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (p: Partial<ExportFilters>) => setFilters((f) => ({ ...f, ...p }));

  const allAccounts = filters.accountIds.length === 0;
  const toggleAccount = (id: string) =>
    setFilters((f) => ({ ...f, accountIds: f.accountIds.includes(id) ? f.accountIds.filter((x) => x !== id) : [...f.accountIds, id] }));

  const query = useMemo(() => {
    const params = new URLSearchParams({ format });
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    for (const id of filters.accountIds) params.append("accountId", id);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    if (filters.transfers !== "include") params.set("transfers", filters.transfers);
    if (filters.q.trim()) params.set("q", filters.q.trim());
    return params.toString();
  }, [format, filters]);

  const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/transactions/export?${query}`);
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(body.error ?? `HTTP ${resp.status}`, resp.status);
      }
      saveBlob(await resp.blob(), filenameOf(resp.headers.get("Content-Disposition")) ?? `transacoes.${format === "xlsx" ? "xlsx" : format}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Exportar transações"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Exportar transações</h2>
            <p className="text-sm text-slate-500">Escolha o formato, as contas e o período do arquivo.</p>
          </div>
          <button className="btn btn-sm" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <section className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Formato</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`rounded-md border p-3 text-left transition ${
                  format === f.id ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200" : "border-slate-300 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="text-sm font-medium">{f.label}</div>
                <div className="text-xs text-slate-500">{f.hint}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contas</h3>
            <button className="text-xs text-sky-700 hover:underline" onClick={() => patch({ accountIds: [] })}>
              Todas as contas
            </button>
          </div>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
            {accounts.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={filters.accountIds.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                <span className="truncate">{a.name}</span>
                {a.bankName && <span className="truncate text-xs text-slate-400">{a.bankName}</span>}
              </label>
            ))}
            {!accounts.length && <p className="px-1.5 py-1 text-sm text-slate-500">Nenhuma conta disponível.</p>}
          </div>
          <p className="text-xs text-slate-500">
            {allAccounts ? "Sem marcar nada, o arquivo traz todas as contas." : `${filters.accountIds.length} conta(s) no mesmo arquivo, em ordem de data.`}
          </p>
        </section>

        <section className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Período</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input type="date" className="input" value={filters.from} onChange={(e) => patch({ from: e.target.value })} aria-label="Data inicial" />
            <span className="text-slate-500">até</span>
            <input type="date" className="input" value={filters.to} onChange={(e) => patch({ to: e.target.value })} aria-label="Data final" />
            <button className="btn btn-sm" onClick={() => patch({ from: "", to: "" })}>
              Todo o histórico
            </button>
          </div>
          {invalidRange && <p className="text-xs text-rose-700">A data inicial vem depois da final.</p>}
        </section>

        <section className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filtros</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input" value={filters.categoryId} onChange={(e) => patch({ categoryId: e.target.value })} aria-label="Categoria">
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
            <select
              className="input"
              value={filters.transfers}
              onChange={(e) => patch({ transfers: e.target.value as ExportFilters["transfers"] })}
              aria-label="Transferências"
            >
              <option value="include">Com transferências</option>
              <option value="exclude">Sem transferências</option>
              <option value="only">Só transferências</option>
            </select>
            <input className="input min-w-52 flex-1" placeholder="Buscar na descrição, contraparte ou notas…" value={filters.q} onChange={(e) => patch({ q: e.target.value })} />
          </div>
        </section>

        {error && <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={download} disabled={busy || invalidRange}>
            {busy ? "Gerando…" : "Exportar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoga depois do clique: o navegador ainda está lendo o blob no momento do download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nome do arquivo que o servidor mandou no Content-Disposition (prefere o `filename*`). */
function filenameOf(disposition: string | null): string | null {
  if (!disposition) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : null;
}
