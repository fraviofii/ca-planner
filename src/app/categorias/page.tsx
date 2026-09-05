"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type CategoryGroupDto } from "@/lib/client";

export default function CategoriesPage() {
  const [groups, setGroups] = useState<CategoryGroupDto[]>([]);
  const [uncategorized, setUncategorized] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [newCategory, setNewCategory] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await api<{ groups: CategoryGroupDto[]; uncategorized: number }>("/api/categories");
      setGroups(r.groups);
      setUncategorized(r.uncategorized);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const addGroup = () => {
    const name = newGroup.trim();
    if (!name) return;
    run(() => api("/api/category-groups", { method: "POST", body: JSON.stringify({ name }) })).then(() => setNewGroup(""));
  };

  const addCategory = (groupId: string) => {
    const name = (newCategory[groupId] ?? "").trim();
    if (!name) return;
    run(() => api("/api/categories", { method: "POST", body: JSON.stringify({ name, groupId }) })).then(() =>
      setNewCategory((s) => ({ ...s, [groupId]: "" })),
    );
  };

  const renameGroup = (g: CategoryGroupDto) => {
    const name = window.prompt("Novo nome do grupo:", g.name)?.trim();
    if (!name || name === g.name) return;
    run(() => api(`/api/category-groups/${g.id}`, { method: "PATCH", body: JSON.stringify({ name }) }));
  };

  const deleteGroup = (g: CategoryGroupDto) => {
    const n = g.categories.reduce((s, c) => s + c.count, 0);
    if (!window.confirm(`Apagar o grupo "${g.name}" e suas ${g.categories.length} categoria(s)? ${n} lançamento(s) voltarão para "Sem categoria".`)) return;
    run(() => api(`/api/category-groups/${g.id}`, { method: "DELETE" }));
  };

  const renameCategory = (c: CategoryGroupDto["categories"][number]) => {
    const name = window.prompt("Novo nome da categoria:", c.name)?.trim();
    if (!name || name === c.name) return;
    run(() => api(`/api/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ name }) }));
  };

  const moveCategory = (c: CategoryGroupDto["categories"][number], groupId: string) =>
    run(() => api(`/api/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ groupId }) }));

  const deleteCategory = (c: CategoryGroupDto["categories"][number]) => {
    if (!window.confirm(`Apagar "${c.name}"? ${c.count} lançamento(s) voltarão para "Sem categoria".`)) return;
    run(() => api(`/api/categories/${c.id}`, { method: "DELETE" }));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
          <p className="text-sm text-slate-500">
            Dois níveis: grupo › categoria. {uncategorized > 0 ? `${uncategorized} lançamento(s) ainda sem categoria.` : "Tudo categorizado."}
          </p>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addGroup();
          }}
        >
          <input className="input" placeholder="Novo grupo…" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
          <button className="btn btn-primary" type="submit">
            Adicionar grupo
          </button>
        </form>
      </header>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <section key={g.id} className="card">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="truncate font-semibold">{g.name}</h2>
              <div className="flex shrink-0 gap-1">
                <button className="btn btn-sm" onClick={() => renameGroup(g)}>
                  Renomear
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => deleteGroup(g)}>
                  Apagar
                </button>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {g.categories.map((c) => (
                <li key={c.id} className="group flex items-center gap-2 py-1.5 text-sm">
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-slate-400">{c.count}</span>
                  <select
                    className="input btn-sm invisible max-w-28 py-0.5 group-hover:visible"
                    value={g.id}
                    title="Mover para outro grupo"
                    onChange={(e) => moveCategory(c, e.target.value)}
                  >
                    {groups.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-sm invisible group-hover:visible" onClick={() => renameCategory(c)}>
                    ✎
                  </button>
                  <button className="btn btn-sm btn-danger invisible group-hover:visible" onClick={() => deleteCategory(c)}>
                    ×
                  </button>
                </li>
              ))}
              {g.categories.length === 0 && <li className="py-1.5 text-sm text-slate-400">Sem categorias.</li>}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addCategory(g.id);
              }}
            >
              <input
                className="input flex-1"
                placeholder="Nova categoria…"
                value={newCategory[g.id] ?? ""}
                onChange={(e) => setNewCategory((s) => ({ ...s, [g.id]: e.target.value }))}
              />
              <button className="btn btn-sm" type="submit">
                +
              </button>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
