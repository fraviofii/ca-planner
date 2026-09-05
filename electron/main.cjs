/**
 * Processo principal do Electron.
 *
 * Dois modos:
 *  - Desenvolvimento (npm run electron:dev): NEXT_DEV_URL aponta para o `next dev` já em
 *    execução e a janela só carrega essa URL.
 *  - Autônomo (npm run electron): sobe o servidor Next de produção dentro do processo, em
 *    uma porta livre de 127.0.0.1, e carrega a janela nele. Antes disso aplica as
 *    migrações do Prisma, para o banco existir na primeira execução.
 *
 * O banco fica onde o .env mandar (DATABASE_URL). Sem .env, usa a pasta userData do
 * sistema — assim o app funciona mesmo fora da pasta do projeto.
 */
const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });

if (!process.env.DATABASE_URL) {
  const dbPath = path.join(app.getPath("userData"), "ca_planner.db");
  process.env.DATABASE_URL = `file:${dbPath}`;
}

// A chave que cifra os segredos no banco fica ao lado do .db. Resolvemos aqui, com o
// caminho absoluto, porque o cwd do Electron varia conforme o app é aberto.
if (!process.env.CA_PLANNER_KEY_FILE) {
  const raw = process.env.DATABASE_URL.replace(/^file:/, "").split("?")[0];
  const dbAbs = path.isAbsolute(raw) ? raw : path.resolve(ROOT, "prisma", raw);
  process.env.CA_PLANNER_KEY_FILE = path.join(path.dirname(dbAbs), ".secret-key");
}

function ensureDatabase() {
  // `prisma migrate deploy` é idempotente: aplica só o que falta.
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = spawnSync(npx, ["prisma", "migrate", "deploy"], { cwd: ROOT, env: process.env, stdio: "inherit", shell: false });
  if (r.status !== 0) {
    throw new Error(`prisma migrate deploy falhou (código ${r.status}).`);
  }
}

async function startNextServer() {
  if (!fs.existsSync(path.join(ROOT, ".next"))) {
    throw new Error("Build do Next não encontrado. Rode `npm run build` antes (ou use `npm run electron`).");
  }
  const next = require("next");
  const nextApp = next({ dev: false, dir: ROOT });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  const server = http.createServer((req, res) => handle(req, res));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "CA Planner",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Links externos (Meu Pluggy, Dashboard) abrem no navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(url)) {
      shell.openExternal(target);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  win.loadURL(url);
  return win;
}

app.whenReady().then(async () => {
  try {
    let url = process.env.NEXT_DEV_URL;
    if (!url) {
      ensureDatabase();
      url = await startNextServer();
    }
    createWindow(url);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
    });
  } catch (e) {
    dialog.showErrorBox("CA Planner não conseguiu iniciar", String(e && e.message ? e.message : e));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
