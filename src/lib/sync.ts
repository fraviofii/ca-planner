import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { dayToDate } from "@/lib/dates";
import { ConsentExpiredError, PluggyClient, PluggyError } from "@/lib/pluggy/client";
import { getPluggyCredentials } from "@/lib/settings";
import { looksLikeTransfer, normalizeTransaction, type NormalizedTransaction } from "@/lib/pluggy/normalize";

export interface SyncResult {
  connectionId: string;
  nickname: string;
  ok: boolean;
  error?: string;
  accounts: number;
  created: number;
  updated: number;
  from: string;
  to: string;
}

/**
 * Grava uma transação normalizada. Se já existe (mesmo externalId), atualiza só o que vem do
 * banco (valor, descrição, status) e preserva categoria, flag de transferência e notas.
 */
export async function upsertTransaction(
  accountDbId: string,
  n: NormalizedTransaction,
): Promise<"created" | "updated"> {
  const existing = await prisma.transaction.findUnique({ where: { externalId: n.externalId }, select: { id: true } });
  const fromBank = {
    date: dayToDate(n.day),
    amountCents: n.amountCents,
    description: n.description,
    counterparty: n.counterparty,
    providerCategory: n.providerCategory,
    providerType: n.providerType,
    status: n.status,
    raw: n.raw,
  };
  if (existing) {
    await prisma.transaction.update({ where: { id: existing.id }, data: { ...fromBank, accountId: accountDbId } });
    return "updated";
  }
  await prisma.transaction.create({
    data: {
      externalId: n.externalId,
      accountId: accountDbId,
      ...fromBank,
      isTransfer: looksLikeTransfer(n.providerCategory),
    },
  });
  return "created";
}

/** Sincroniza uma conexão no período [from, to] (dias AAAA-MM-DD). Só contas BANK. */
export async function syncConnection(connectionId: string, from: string, to: string): Promise<SyncResult> {
  const conn = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
  const result: SyncResult = { connectionId, nickname: conn.nickname, ok: false, accounts: 0, created: 0, updated: 0, from, to };

  const { creds } = await getPluggyCredentials();
  if (!creds) {
    result.error = "Credenciais da Pluggy não configuradas. Cadastre clientId e clientSecret em Conexões › Credenciais da Pluggy.";
    return result;
  }
  const client = new PluggyClient(creds);

  try {
    const item = await client.checkHealth(conn.itemId);
    await prisma.connection.update({
      where: { id: conn.id },
      data: { status: item.status ?? null, lastError: null },
    });

    const accounts = await client.accounts(conn.itemId);
    for (const acc of accounts) {
      const bankName = item.connector?.name ?? null;
      const dbAccount = await prisma.account.upsert({
        where: { externalId: acc.id },
        update: {
          connectionId: conn.id,
          name: acc.name,
          bankName,
          type: acc.type,
          subtype: acc.subtype ?? null,
          number: acc.number ?? null,
          currency: acc.currencyCode ?? "BRL",
          balanceCents: acc.balance != null ? toCents(acc.balance) : null,
        },
        create: {
          externalId: acc.id,
          connectionId: conn.id,
          name: acc.name,
          bankName,
          type: acc.type,
          subtype: acc.subtype ?? null,
          number: acc.number ?? null,
          currency: acc.currencyCode ?? "BRL",
          balanceCents: acc.balance != null ? toCents(acc.balance) : null,
          // Decisão de v1: cartão de crédito fica de fora — a fatura já aparece como
          // débito na conta corrente. Fica registrado, mas ignorado.
          ignored: acc.type !== "BANK",
        },
      });

      if (dbAccount.ignored) continue;
      result.accounts++;

      for await (const t of client.transactions(acc.id, from, to)) {
        const n = normalizeTransaction(t, acc);
        if (!n.day) continue;
        const outcome = await upsertTransaction(dbAccount.id, n);
        if (outcome === "created") result.created++;
        else result.updated++;
      }
    }

    await prisma.connection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastError: null } });
    result.ok = true;
  } catch (e) {
    const message = e instanceof PluggyError ? e.message : `Erro inesperado: ${(e as Error).message}`;
    result.error = e instanceof ConsentExpiredError ? `Consentimento: ${message}` : message;
    await prisma.connection.update({
      where: { id: conn.id },
      data: { lastError: result.error, ...(e instanceof ConsentExpiredError ? { status: "LOGIN_ERROR" } : {}) },
    });
  }
  return result;
}
