/**
 * Prepara o servidor standalone para ir dentro do app.
 *
 * O `output: "standalone"` do Next monta o servidor e as dependências em
 * .next/standalone, mas deixa de fora os estáticos e o public/ — que ele espera encontrar
 * ao lado, no formato de uma instalação normal. Este passo junta as peças, para o
 * electron-builder só precisar copiar uma pasta.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STANDALONE = path.join(ROOT, ".next", "standalone");

if (!existsSync(path.join(STANDALONE, "server.js"))) {
  console.error("Servidor standalone não encontrado. Rode `npm run build` antes.");
  process.exit(1);
}

const staticSrc = path.join(ROOT, ".next", "static");
const staticDest = path.join(STANDALONE, ".next", "static");
rmSync(staticDest, { recursive: true, force: true });
cpSync(staticSrc, staticDest, { recursive: true });
console.log("estáticos copiados →", path.relative(ROOT, staticDest));

// O Next copia o .env do projeto para dentro do standalone. Ele não pode viajar no app:
// aponta para o banco desta máquina e é onde as credenciais da Pluggy poderiam estar.
for (const name of [".env", ".env.local", ".env.production"]) {
  const leaked = path.join(STANDALONE, name);
  if (existsSync(leaked)) {
    rmSync(leaked);
    console.log("removido do servidor empacotado →", name);
  }
}

const publicSrc = path.join(ROOT, "public");
if (existsSync(publicSrc)) {
  const publicDest = path.join(STANDALONE, "public");
  rmSync(publicDest, { recursive: true, force: true });
  cpSync(publicSrc, publicDest, { recursive: true });
  console.log("public copiado →", path.relative(ROOT, publicDest));
}
