"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type CategoryGroupDto, type ConnectionDto } from "@/lib/client";

interface Option {
  href: string;
  label: string;
  description: string;
  detail: string | null;
}

export default function SettingsPage() {
  const [categories, setCategories] = useState<{ groups: number; categories: number } | null>(null);
  const [connections, setConnections] = useState<{ connections: number; accounts: number } | null>(null);

  useEffect(() => {
    api<{ groups: CategoryGroupDto[] }>("/api/categories")
      .then((r) => setCategories({ groups: r.groups.length, categories: r.groups.reduce((s, g) => s + g.categories.length, 0) }))
      .catch(() => {});
    api<{ connections: ConnectionDto[] }>("/api/connections")
      .then((r) => setConnections({ connections: r.connections.length, accounts: r.connections.reduce((s, c) => s + c.accounts.length, 0) }))
      .catch(() => {});
  }, []);

  const options: Option[] = [
    {
      href: "/configuracoes/categorias",
      label: "Categorias",
      description: "Grupos e categorias usados para classificar os lançamentos e o planejamento.",
      detail: categories && `${categories.groups} grupo(s) · ${categories.categories} categoria(s)`,
    },
    {
      href: "/configuracoes/conexoes",
      label: "Conexões",
      description: "Credenciais da Pluggy, itens conectados, contas e sincronização dos extratos.",
      detail: connections && `${connections.connections} conexão(ões) · ${connections.accounts} conta(s)`,
    },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-slate-500">O que dá para ajustar no CA Planner.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {options.map((o) => (
          <Link key={o.href} href={o.href} className="card transition hover:border-sky-300 hover:shadow">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{o.label}</span>
              <span className="text-slate-400">›</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{o.description}</p>
            <p className="mt-2 text-xs text-slate-400">{o.detail ?? "…"}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
