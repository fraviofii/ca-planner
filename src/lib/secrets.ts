/**
 * Cifra valores sensíveis antes de gravar no banco (AES-256-GCM).
 *
 * A chave fica em um arquivo ao lado do banco (`data/.secret-key`, permissão 0600), criado
 * na primeira vez. Assim, copiar só o arquivo .db não expõe as credenciais. Quem tiver
 * acesso à pasta inteira tem acesso às credenciais — é o mesmo nível de proteção do .env.
 *
 * Caminho da chave: CA_PLANNER_KEY_FILE, ou derivado de DATABASE_URL.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";

const PREFIX = "enc:v1:";

/** Pasta do banco: resolve DATABASE_URL (relativo à pasta prisma/, como o Prisma faz). */
export function dataDir(): string {
  const url = process.env.DATABASE_URL ?? "file:../data/ca_planner.db";
  const raw = url.replace(/^file:/, "").split("?")[0];
  const abs = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), "prisma", raw);
  return path.dirname(abs);
}

function keyFile(): string {
  return process.env.CA_PLANNER_KEY_FILE || path.join(dataDir(), ".secret-key");
}

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const file = keyFile();
  if (existsSync(file)) {
    const key = Buffer.from(readFileSync(file, "utf-8").trim(), "base64");
    if (key.length !== 32) throw new Error(`Chave em ${file} inválida (esperados 32 bytes).`);
    cachedKey = key;
    return key;
  }
  const key = randomBytes(32);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, key.toString("base64") + "\n", { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* Windows não tem modo POSIX */
  }
  cachedKey = key;
  return key;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, body]).toString("base64");
}

export function decrypt(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const body = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", loadKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf-8");
}
