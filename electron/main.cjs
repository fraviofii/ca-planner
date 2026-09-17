/**
 * Processo principal do Electron.
 *
 * Três modos:
 *  - Desenvolvimento (npm run electron:dev): NEXT_DEV_URL aponta para o `next dev` já em
 *    execução e a janela só carrega essa URL.
 *  - A partir da pasta do projeto (npm run electron): sobe o servidor Next de produção
 *    dentro deste processo, em uma porta livre de 127.0.0.1.
 *  - Empacotado (.app/.dmg): sobe o servidor "standalone" que veio em Resources, num
 *    processo Node à parte — o próprio binário do Electron com ELECTRON_RUN_AS_NODE.
 *
 * Em qualquer um deles as migrações são aplicadas antes de abrir a janela, para o banco
 * existir na primeira execução (ver electron/migrate.cjs — sem CLI do Prisma).
 *
 * O banco fica onde o .env mandar (DATABASE_URL). Sem .env — que é o caso do app
 * empacotado —, usa a pasta userData do sistema.
 */
const { app, BrowserWindow, shell, dialog } = require("electron");

// Sem isto o Electron nomeia a pasta de dados pelo `name` do package.json ("ca-planner").
// O nome de exibição é o que o usuário procura em ~/Library/Application Support.
app.setName("CA Planner");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { applyMigrations } = require("./migrate.cjs");

const PACKAGED = app.isPackaged;
const ROOT = PACKAGED ? process.resourcesPath : path.join(__dirname, "..");
const MIGRATIONS = PACKAGED ? path.join(process.resourcesPath, "migrations") : path.join(ROOT, "prisma", "migrations");
const SERVER = path.join(process.resourcesPath, "server", "server.js");

// Só a execução a partir da pasta do projeto tem .env; o app empacotado não carrega
// dependência nenhuma aqui — o que ele precisa está em Resources.
if (!PACKAGED) require("dotenv").config({ path: path.join(ROOT, ".env") });

if (!process.env.DATABASE_URL) {
  const dbPath = path.join(app.getPath("userData"), "ca_planner.db");
  process.env.DATABASE_URL = `file:${dbPath}`;
}

// A chave que cifra os segredos no banco fica ao lado do .db. Resolvemos aqui, com o
// caminho absoluto, porque o cwd do Electron varia conforme o app é aberto.
const DB_FILE = resolveDbFile(process.env.DATABASE_URL);
if (!process.env.CA_PLANNER_KEY_FILE) {
  process.env.CA_PLANNER_KEY_FILE = path.join(path.dirname(DB_FILE), ".secret-key");
}

/** "file:../data/x.db" → caminho absoluto (o relativo é a partir de prisma/, como no CLI). */
function resolveDbFile(url) {
  const raw = url.replace(/^file:/, "").split("?")[0];
  return path.isAbsolute(raw) ? raw : path.resolve(ROOT, "prisma", raw);
}

function ensureDatabase() {
  const applied = applyMigrations(DB_FILE, MIGRATIONS);
  if (applied.length) console.log(`Banco atualizado: ${applied.join(", ")}`);
}

/** Uma porta livre em 127.0.0.1 — o app nunca briga por uma porta fixa. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Sobe o servidor Next de dentro deste processo (rodando da pasta do projeto). */
async function startInProcess() {
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

/**
 * Sobe o servidor standalone empacotado. Roda em outro processo porque o `server.js` do
 * Next espera um Node de verdade; o binário do Electron faz esse papel com
 * ELECTRON_RUN_AS_NODE.
 */
let serverProcess = null;
async function startPackagedServer() {
  if (!fs.existsSync(SERVER)) throw new Error(`Servidor não encontrado em ${SERVER}.`);
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;

  serverProcess = spawn(process.execPath, [SERVER], {
    cwd: path.dirname(SERVER),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(port), HOSTNAME: "127.0.0.1" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  serverProcess.on("exit", (code) => {
    serverProcess = null;
    if (code) console.error(`Servidor encerrou com código ${code}.`);
  });

  await waitFor(`${url}/api/config`, 30_000);
  return url;
}

/** Espera o servidor responder — subir o Next leva um instante. */
function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (!serverProcess) return reject(new Error("O servidor encerrou antes de responder."));
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("O servidor não respondeu a tempo."));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
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
      url = PACKAGED ? await startPackagedServer() : await startInProcess();
    }
    console.log(`CA Planner em ${url} — banco: ${DB_FILE}`);
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

// O servidor é filho deste processo: sai junto, senão fica uma porta pendurada.
app.on("will-quit", () => {
  if (serverProcess) serverProcess.kill();
});
