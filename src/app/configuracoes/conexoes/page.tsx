"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type AccountDto, type ConnectionDto, type ImportResultDto, type SyncResultDto } from "@/lib/client";
import { Money } from "@/components/Money";

type SyncPeriod = { days?: number; from?: string; to?: string };
type ConfigDto = { pluggyConfigured: boolean; pluggySource: "db" | "env" | "none"; databaseUrl: string | null };
type CredentialsDto = { configured: boolean; source: "db" | "env" | "none"; clientIdMasked: string | null };

export default function ConnectionsPage() {
  const [config, setConfig] = useState<ConfigDto | null>(null);
  const [credState, setCredState] = useState<CredentialsDto | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [credMessage, setCredMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [connections, setConnections] = useState<ConnectionDto[]>([]);
  const [orphanAccounts, setOrphanAccounts] = useState<AccountDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const [itemId, setItemId] = useState("");
  const [nickname, setNickname] = useState("");
  const [days, setDays] = useState(30);
  const [rangeMode, setRangeMode] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    try {
      const [cfg, cred, c, a] = await Promise.all([
        api<ConfigDto>("/api/config"),
        api<CredentialsDto>("/api/settings/pluggy"),
        api<{ connections: ConnectionDto[] }>("/api/connections"),
        api<{ accounts: AccountDto[] }>("/api/accounts"),
      ]);
      setConfig(cfg);
      setCredState(cred);
      setConnections(c.connections);
      setOrphanAccounts(a.accounts.filter((x) => !x.connection));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const period = (): SyncPeriod => (rangeMode && from && to ? { from, to } : { days });
  const say = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString("pt-BR")} — ${m}`, ...l].slice(0, 30));

  async function addConnection(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/connections", { method: "POST", body: JSON.stringify({ itemId, nickname }) });
      setItemId("");
      setNickname("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function describe(r: SyncResultDto) {
    return r.ok
      ? `${r.nickname}: ${r.created} novo(s), ${r.updated} atualizado(s) em ${r.accounts} conta(s), ${r.from} a ${r.to}.`
      : `${r.nickname}: FALHOU — ${r.error}`;
  }

  async function sync(c: ConnectionDto) {
    setBusy(c.id);
    try {
      const r = await api<SyncResultDto>(`/api/connections/${c.id}/sync`, { method: "POST", body: JSON.stringify(period()) });
      say(describe(r));
    } catch (err) {
      // 502 devolve o SyncResult no corpo; a ApiError só traz a mensagem
      say(`${c.nickname}: FALHOU — ${(err as Error).message}`);
    } finally {
      setBusy(null);
      load();
    }
  }

  async function syncAll() {
    setBusy("all");
    try {
      const r = await api<{ results: SyncResultDto[] }>("/api/connections/sync-all", { method: "POST", body: JSON.stringify(period()) });
      for (const x of r.results) say(describe(x));
      if (!r.results.length) say("Nenhuma conexão cadastrada.");
    } catch (err) {
      say(`Sincronização falhou — ${(err as Error).message}`);
    } finally {
      setBusy(null);
      load();
    }
  }

  async function remove(c: ConnectionDto) {
    if (!window.confirm(`Remover a conexão "${c.nickname}"? As contas e lançamentos já importados ficam no banco.`)) return;
    try {
      await api(`/api/connections/${c.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleIgnored(accountId: string, ignored: boolean) {
    try {
      await api(`/api/accounts/${accountId}`, { method: "PATCH", body: JSON.stringify({ ignored }) });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function importFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    setBusy("import");
    try {
      const r = await api<{ results: ImportResultDto[] }>("/api/import", { method: "POST", body: form });
      for (const x of r.results) {
        say(
          `${x.file}: ${x.total} lançamento(s) — ${x.created} novo(s), ${x.updated} atualizado(s), ${x.skipped} ignorado(s)` +
            (x.errors.length ? ` — erros: ${x.errors.join("; ")}` : ""),
        );
      }
    } catch (err) {
      say(`Importação falhou — ${(err as Error).message}`);
    } finally {
      setBusy(null);
      e.target.value = "";
      load();
    }
  }

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setBusy("creds");
    setCredMessage(null);
    try {
      const r = await api<{ clientIdMasked: string }>("/api/settings/pluggy", {
        method: "PUT",
        body: JSON.stringify({ clientId, clientSecret }),
      });
      setCredMessage({ ok: true, text: `Credenciais validadas na Pluggy e gravadas (${r.clientIdMasked}).` });
      setClientId("");
      setClientSecret("");
      await load();
    } catch (err) {
      setCredMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function removeCredentials() {
    if (!window.confirm("Remover as credenciais da Pluggy do banco? A sincronização deixa de funcionar até cadastrar de novo.")) return;
    setBusy("creds");
    try {
      await api("/api/settings/pluggy", { method: "DELETE" });
      setCredMessage({ ok: true, text: "Credenciais removidas." });
      await load();
    } catch (err) {
      setCredMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Conexões</h1>
        <p className="text-sm text-slate-500">Cada conexão é um item do Meu Pluggy vinculado à sua aplicação no Dashboard.</p>
      </header>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Credenciais da Pluggy</h2>
          {credState && (
            <span className={`badge ${credState.configured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              {credState.source === "db" && `gravadas no banco · ${credState.clientIdMasked}`}
              {credState.source === "env" && `vindas do .env · ${credState.clientIdMasked}`}
              {credState.source === "none" && "não configuradas"}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600">
          clientId e clientSecret da aplicação no{" "}
          <a className="text-sky-700 underline-offset-2 hover:underline" href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer">
            Dashboard da Pluggy
          </a>
          . O secret é gravado cifrado; a chave fica em <code>data/.secret-key</code>, fora do banco. Ao salvar, as credenciais são testadas na Pluggy.
        </p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={saveCredentials}>
          <div className="min-w-72 flex-1">
            <label className="block text-xs font-medium text-slate-500">clientId</label>
            <input className="input w-full" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" required />
          </div>
          <div className="min-w-72 flex-1">
            <label className="block text-xs font-medium text-slate-500">clientSecret</label>
            <input className="input w-full" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={!!busy}>
            {busy === "creds" ? "Validando…" : credState?.source === "db" ? "Substituir" : "Testar e salvar"}
          </button>
          {credState?.source === "db" && (
            <button className="btn btn-danger" type="button" disabled={!!busy} onClick={removeCredentials}>
              Remover
            </button>
          )}
        </form>
        {credMessage && (
          <div className={`rounded-md border p-2 text-sm ${credMessage.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {credMessage.text}
          </div>
        )}
        {credState && !credState.configured && (
          <p className="text-xs text-amber-700">Sem credenciais a sincronização fica desabilitada. Enquanto isso, você pode importar os JSON da skill abaixo.</p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sincronizar</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            <input type="radio" checked={!rangeMode} onChange={() => setRangeMode(false)} /> últimos
          </label>
          <select className="input" value={days} disabled={rangeMode} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 15, 30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </select>
          <label className="ml-3 flex items-center gap-1">
            <input type="radio" checked={rangeMode} onChange={() => setRangeMode(true)} /> intervalo
          </label>
          <input type="date" className="input" disabled={!rangeMode} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-500">até</span>
          <input type="date" className="input" disabled={!rangeMode} value={to} onChange={(e) => setTo(e.target.value)} />
          {config?.pluggyConfigured && !connections.length && (
            <span className="ml-auto text-xs text-amber-700">Cadastre pelo menos uma conexão (itemId) abaixo para habilitar a sincronização.</span>
          )}
          <button className={`btn btn-primary ${config?.pluggyConfigured && !connections.length ? "" : "ml-auto"}`} disabled={!!busy || !config?.pluggyConfigured || !connections.length} onClick={syncAll}>
            {busy === "all" ? "Sincronizando…" : "Sincronizar todas"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Lançamentos já existentes são atualizados (valor, descrição, status) sem perder a categoria que você definiu. Só contas corrente e poupança são
          sincronizadas; cartões ficam registrados como ignorados. Prefira períodos até D-1: o dia corrente ainda pode mudar.
        </p>
      </section>

      <section className="space-y-3">
        {connections.map((c) => (
          <div key={c.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{c.nickname}</h3>
                  {c.status && (
                    <span className={`badge ${c.status === "UPDATED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{c.status}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  item <code>{c.itemId}</code>
                  {c.lastSyncAt && <> · última sincronização {new Date(c.lastSyncAt).toLocaleString("pt-BR")}</>}
                </div>
                {c.lastError && <div className="mt-1 text-xs text-rose-700">{c.lastError}</div>}
              </div>
              <div className="flex gap-1">
                <button className="btn btn-sm btn-primary" disabled={!!busy || !config?.pluggyConfigured} onClick={() => sync(c)}>
                  {busy === c.id ? "Sincronizando…" : "Sincronizar"}
                </button>
                <button className="btn btn-sm btn-danger" disabled={!!busy} onClick={() => remove(c)}>
                  Remover
                </button>
              </div>
            </div>
            {c.accounts.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {c.accounts.map((a) => (
                  <li key={a.id} className={`flex items-center gap-3 py-1.5 ${a.ignored ? "text-slate-400" : ""}`}>
                    <span className="flex-1 truncate">
                      {a.name} <span className="text-xs text-slate-400">{a.type}{a.subtype ? ` · ${a.subtype}` : ""}</span>
                    </span>
                    <span className="text-xs text-slate-400">{a.transactions} lanç.</span>
                    {a.balanceCents != null && <Money cents={a.balanceCents} />}
                    <button className="btn btn-sm" onClick={() => toggleIgnored(a.id, !a.ignored)} title={a.ignored ? "Voltar a sincronizar e exibir" : "Ignorar esta conta"}>
                      {a.ignored ? "ignorada" : "ativa"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <form className="card flex flex-wrap items-end gap-2" onSubmit={addConnection}>
          <div className="flex-1 min-w-64">
            <label className="block text-xs font-medium text-slate-500">itemId (Dashboard da Pluggy)</label>
            <input className="input w-full" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="ex.: 1a2b3c4d-…" required />
          </div>
          <div className="min-w-48">
            <label className="block text-xs font-medium text-slate-500">Apelido</label>
            <input className="input w-full" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="ex.: Santander PF" required />
          </div>
          <button className="btn btn-primary" type="submit">
            Adicionar conexão
          </button>
        </form>
      </section>

      {orphanAccounts.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Contas sem conexão (importadas de JSON)</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {orphanAccounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-1.5">
                <span className="flex-1">{a.name}</span>
                <span className="text-xs text-slate-400">{a.transactions} lanç.</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Ao sincronizar a conexão correspondente, a conta é reconhecida pelo accountId e vinculada automaticamente.</p>
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Importar JSON da skill</h2>
        <p className="text-sm text-slate-600">
          Arquivos gerados por <code>fetch_pluggy.py</code> (ex.: <code>extrato_santander_2026-07-01_2026-08-15.json</code>). Pode selecionar vários.
        </p>
        <input type="file" accept=".json,application/json" multiple disabled={!!busy} onChange={importFiles} className="text-sm" />
      </section>

      {log.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Registro</h2>
          <ul className="space-y-1 font-mono text-xs text-slate-700">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {config?.databaseUrl && <p className="text-xs text-slate-400">Banco: {config.databaseUrl}</p>}
    </div>
  );
}
