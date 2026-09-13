"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Item {
  href: string;
  label: string;
  children?: Array<{ href: string; label: string }>;
}

const ITEMS: Item[] = [
  { href: "/", label: "Visão geral" },
  { href: "/transacoes", label: "Transações" },
  { href: "/planejamento", label: "Planejamento" },
  { href: "/fluxo-de-caixa", label: "Fluxo de caixa" },
  {
    href: "/configuracoes",
    label: "Configurações",
    children: [
      { href: "/configuracoes/categorias", label: "Categorias" },
      { href: "/configuracoes/conexoes", label: "Conexões" },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();
  // Quem tem subitens só acende no próprio caminho: o destaque fica com o subitem aberto.
  const isActive = (href: string, exact: boolean) => (exact || href === "/" ? pathname === href : pathname.startsWith(href));

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {ITEMS.map((it) => (
        <div key={it.href} className="flex flex-col gap-0.5">
          <NavLink href={it.href} label={it.label} active={isActive(it.href, Boolean(it.children))} />
          {it.children?.map((child) => (
            <NavLink key={child.href} href={child.href} label={child.label} active={isActive(child.href, false)} nested />
          ))}
        </div>
      ))}
    </nav>
  );
}

function NavLink({ href, label, active, nested }: { href: string; label: string; active: boolean; nested?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-md py-2 text-sm transition ${nested ? "ml-3 border-l border-slate-200 pl-4 pr-3" : "px-3 font-medium"} ${
        active ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {label}
    </Link>
  );
}
