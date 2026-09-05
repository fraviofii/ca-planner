/**
 * Importa os JSON gerados pela skill (fetch_pluggy.py / fetch_extrato.py).
 *
 * Formato esperado:
 *   { "item": "...", "inicio": "...", "fim": "...", "transacoes": [ {
 *       "idTransacao", "dataTransacao", "tipoTransacao", "tipoOperacao": "C"|"D",
 *       "valor" (sempre positivo), "titulo", "descricao",
 *       "detalhes": { "categoriaPluggy", "status", "conta", "contaId", "contraparte" } } ] }
 *
 * A conta é criada se não existir (sem conexão vinculada). Quando a mesma conta for
 * sincronizada pela Pluggy depois, o accountId casa e a conexão passa a ser vinculada.
 */
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { isValidDay } from "@/lib/dates";
import { upsertTransaction } from "@/lib/sync";

interface SkillTransaction {
  idTransacao?: string;
  dataTransacao?: string;
  tipoTransacao?: string;
  tipoOperacao?: string;
  valor?: number | string;
  titulo?: string;
  descricao?: string;
  detalhes?: {
    categoriaPluggy?: string | null;
    status?: string | null;
    conta?: string | null;
    contaId?: string | null;
    contraparte?: string | null;
  };
}

export interface ImportResult {
  file: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  accounts: string[];
  errors: string[];
}

export async function importSkillJson(file: string, content: string): Promise<ImportResult> {
  const result: ImportResult = { file, total: 0, created: 0, updated: 0, skipped: 0, accounts: [], errors: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    result.errors.push("Arquivo não é JSON válido.");
    return result;
  }
  const list: SkillTransaction[] = Array.isArray(parsed)
    ? (parsed as SkillTransaction[])
    : ((parsed as { transacoes?: SkillTransaction[] }).transacoes ?? []);
  result.total = list.length;

  const accountCache = new Map<string, string>(); // externalId → id no banco
  const accountNames = new Set<string>();

  for (const t of list) {
    const det = t.detalhes ?? {};
    const externalId = t.idTransacao;
    const day = String(t.dataTransacao ?? "").slice(0, 10);
    if (!externalId || !isValidDay(day)) {
      result.skipped++;
      continue;
    }

    // A skill sempre grava contaId da Pluggy; sem ele, derivamos um id estável do nome.
    const accountExternalId = det.contaId || `import:${(det.conta ?? "conta-desconhecida").toLowerCase()}`;
    const accountName = det.conta ?? "Conta importada";
    let accountDbId = accountCache.get(accountExternalId);
    if (!accountDbId) {
      const acc = await prisma.account.upsert({
        where: { externalId: accountExternalId },
        update: {},
        create: { externalId: accountExternalId, name: accountName, bankName: accountName, type: "BANK" },
      });
      accountDbId = acc.id;
      accountCache.set(accountExternalId, acc.id);
      accountNames.add(acc.name);
    }

    const sign = String(t.tipoOperacao ?? "").toUpperCase().startsWith("D") ? -1 : 1;
    const outcome = await upsertTransaction(accountDbId, {
      externalId,
      day,
      amountCents: sign * Math.abs(toCents(t.valor ?? 0)),
      description: (t.titulo || t.descricao || "SEM DESCRIÇÃO").trim(),
      counterparty: det.contraparte ?? null,
      providerCategory: det.categoriaPluggy ?? null,
      providerType: t.tipoTransacao ?? null,
      status: det.status ?? null,
      raw: JSON.stringify(t),
    });
    if (outcome === "created") result.created++;
    else result.updated++;
  }

  result.accounts = [...accountNames];
  return result;
}
