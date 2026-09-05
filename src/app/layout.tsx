import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "CA Planner",
  description: "Gestão de finanças pessoais",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
            <div className="px-5 py-5">
              <div className="text-lg font-semibold tracking-tight">CA Planner</div>
              <div className="text-xs text-slate-500">finanças pessoais</div>
            </div>
            <Nav />
          </aside>
          <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
