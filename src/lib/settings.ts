import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/secrets";

export const SETTING_KEYS = {
  pluggyClientId: "pluggy.clientId",
  pluggyClientSecret: "pluggy.clientSecret",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return row.encrypted ? decrypt(row.value) : row.value;
  } catch {
    // chave local trocada ou arquivo perdido: trate como ausente, não como erro fatal
    return null;
  }
}

export async function setSetting(key: string, value: string, { secret = false } = {}): Promise<void> {
  const stored = secret ? encrypt(value) : value;
  await prisma.setting.upsert({
    where: { key },
    update: { value: stored, encrypted: secret },
    create: { key, value: stored, encrypted: secret },
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { key } });
}

export interface PluggyCredentials {
  clientId: string;
  clientSecret: string;
}

export type CredentialSource = "db" | "env" | "none";

/**
 * Credenciais da Pluggy: banco primeiro; .env como retaguarda (útil na migração e em
 * automações). Devolve também a origem, para a interface mostrar.
 */
export async function getPluggyCredentials(): Promise<{ creds: PluggyCredentials | null; source: CredentialSource }> {
  const [clientId, clientSecret] = await Promise.all([
    getSetting(SETTING_KEYS.pluggyClientId),
    getSetting(SETTING_KEYS.pluggyClientSecret),
  ]);
  if (clientId && clientSecret) return { creds: { clientId, clientSecret }, source: "db" };
  if (process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET) {
    return { creds: { clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }, source: "env" };
  }
  return { creds: null, source: "none" };
}

export async function savePluggyCredentials(creds: PluggyCredentials): Promise<void> {
  await setSetting(SETTING_KEYS.pluggyClientId, creds.clientId);
  await setSetting(SETTING_KEYS.pluggyClientSecret, creds.clientSecret, { secret: true });
}

export async function clearPluggyCredentials(): Promise<void> {
  await deleteSetting(SETTING_KEYS.pluggyClientId);
  await deleteSetting(SETTING_KEYS.pluggyClientSecret);
}
