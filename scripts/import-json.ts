/**
 * Importa para o banco os JSON gerados pela skill (fetch_pluggy.py).
 *
 *   npm run import:json -- ~/financas/extratos-full/*.json
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { importSkillJson } from "../src/lib/import-json";
import { prisma } from "../src/lib/prisma";

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("Uso: npm run import:json -- <arquivo.json> [...]");
    process.exit(2);
  }
  for (const f of files) {
    const r = await importSkillJson(basename(f), await readFile(f, "utf-8"));
    console.log(
      `${r.file}: ${r.total} lançamento(s) — ${r.created} novo(s), ${r.updated} atualizado(s), ${r.skipped} ignorado(s)` +
        (r.accounts.length ? ` | contas: ${r.accounts.join(", ")}` : "") +
        (r.errors.length ? ` | erros: ${r.errors.join("; ")}` : ""),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
