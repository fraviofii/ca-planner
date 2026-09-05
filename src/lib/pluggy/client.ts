/**
 * Cliente da API da Pluggy (Open Finance) — porte do pluggy_client.py da skill.
 *
 * Fluxo: POST /auth (clientId + clientSecret) devolve uma apiKey válida por 2h, que vai no
 * header X-API-KEY das demais chamadas. Cada conexão banco↔usuário é um "item"; cada item
 * tem uma ou mais "accounts"; transações são consultadas por conta, via /v2/transactions
 * com paginação por cursor (o /transactions antigo responde 410).
 *
 * Peculiaridades herdadas da skill:
 * - GET /items não lista (401): os ids vêm do Dashboard.
 * - A v2 quer dateFrom/dateTo e não aceita pageSize (página fixa em 500).
 * - Consentimento vencido NÃO dá erro nas transações: devolve dados velhos. Por isso
 *   checkHealth() roda antes de cada coleta.
 */

const BASE_URL = process.env.PLUGGY_BASE_URL ?? "https://api.pluggy.ai";
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 4;
const MAX_PAGES = 500; // trava contra cursor que não avança

export class PluggyError extends Error {}
export class ConsentExpiredError extends PluggyError {}

export interface PluggyItem {
  id: string;
  status?: string;
  executionStatus?: string;
  error?: { code?: string; message?: string } | null;
  connector?: { id?: number; name?: string; imageUrl?: string };
  lastUpdatedAt?: string;
  [k: string]: unknown;
}

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: "BANK" | "CREDIT" | string;
  subtype?: string;
  name: string;
  marketingName?: string | null;
  number?: string;
  balance?: number;
  currencyCode?: string;
  [k: string]: unknown;
}

export interface PluggyTransaction {
  id: string;
  accountId?: string;
  date: string;
  description?: string;
  descriptionRaw?: string | null;
  amount: number;
  type?: "DEBIT" | "CREDIT" | string;
  status?: "POSTED" | "PENDING" | string;
  category?: string | null;
  paymentData?: {
    payer?: { name?: string | null } | null;
    receiver?: { name?: string | null } | null;
  } | null;
  [k: string]: unknown;
}

export interface PluggyCredentials {
  clientId: string;
  clientSecret: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function errorDetail(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object") {
      const parts = ["code", "codeDescription", "message", "error", "detail"]
        .filter((k) => body[k])
        .map((k) => `${k}=${typeof body[k] === "string" ? body[k] : JSON.stringify(body[k])}`);
      if (parts.length) return parts.join(" | ");
    }
    return String(text).slice(0, 400);
  } catch {
    return (text || "sem corpo").trim().slice(0, 400);
  }
}

/** Extrai nomes de "property X should not exist" da mensagem de erro da API. */
function rejectedProperties(message: string): string[] {
  return [...message.matchAll(/property (\w+) should not exist/g)].map((m) => m[1]);
}

/** Aceita tanto o cursor puro quanto a URL completa que a API devolve em `next`. */
function extractCursor(next: unknown): string | null {
  if (!next || typeof next !== "string") return null;
  if (!next.includes("://") && !next.includes("?")) return next;
  try {
    const q = new URL(next, BASE_URL).searchParams;
    for (const k of ["after", "cursor", "nextCursor"]) {
      const v = q.get(k);
      if (v) return v;
    }
  } catch {
    /* ignora URL inválida */
  }
  return null;
}

function withinPeriod(t: PluggyTransaction, from: string, to: string): boolean {
  const day = String(t.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return true; // sem data legível, melhor manter
  return from <= day && day <= to;
}

export class PluggyClient {
  private apiKey: string | null = null;
  private expiresAt = 0;

  constructor(private readonly creds: PluggyCredentials) {}

  /** Valida clientId/clientSecret em POST /auth sem fazer mais nada. */
  async testCredentials(): Promise<void> {
    this.apiKey = null;
    await this.getApiKey();
  }

  private async getApiKey(): Promise<string> {
    // A chave vale 2h; renovamos com 5 min de folga.
    if (this.apiKey && this.expiresAt > Date.now() + 5 * 60_000) return this.apiKey;

    const resp = await fetch(`${BASE_URL}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ clientId: this.creds.clientId, clientSecret: this.creds.clientSecret }),
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new PluggyError("Credenciais da Pluggy rejeitadas. Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.");
    }
    if (!resp.ok) throw new PluggyError(`HTTP ${resp.status} em POST /auth: ${await errorDetail(resp)}`);

    const body = (await resp.json()) as { apiKey: string };
    this.apiKey = body.apiKey;
    this.expiresAt = Date.now() + 2 * 3600_000;
    return this.apiKey;
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    let delay = 1000;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const url = new URL(`${BASE_URL}${path}`);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

      const resp = await fetch(url, {
        headers: { "X-API-KEY": await this.getApiKey(), Accept: "application/json" },
      });

      if (resp.status === 403 && attempt === 0) {
        this.apiKey = null; // chave pode ter expirado antes do previsto
        continue;
      }
      if (RETRY_STATUS.has(resp.status) && attempt < MAX_RETRIES - 1) {
        const retryAfter = Number(resp.headers.get("Retry-After"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay);
        delay *= 2;
        continue;
      }
      if (!resp.ok) {
        throw new PluggyError(
          `HTTP ${resp.status} em GET ${path} (params=${JSON.stringify(params)}): ${await errorDetail(resp)}`,
        );
      }
      return (await resp.json()) as T;
    }
    throw new PluggyError("Falha após múltiplas tentativas na API da Pluggy.");
  }

  // ------------------------------------------------------------------ items

  item(itemId: string): Promise<PluggyItem> {
    return this.get<PluggyItem>(`/items/${itemId}`);
  }

  /**
   * Levanta ConsentExpiredError se o item não está saudável. O modo de falha mais comum é
   * silencioso: consentimento vencido faz a consulta devolver dados velhos sem erro.
   */
  async checkHealth(itemId: string): Promise<PluggyItem> {
    const item = await this.item(itemId);
    const status = item.status;
    const code = item.error?.code;
    const badStatus = status === "LOGIN_ERROR" || status === "OUTDATED";
    const badCode =
      code !== undefined &&
      ["USER_AUTHORIZATION_PENDING", "USER_AUTHORIZATION_NOT_GRANTED", "USER_INPUT_TIMEOUT", "INVALID_CREDENTIALS"].includes(code);
    if (badStatus || badCode) {
      const name = item.connector?.name ?? itemId;
      throw new ConsentExpiredError(
        `O item '${name}' está com status ${status} (${code ?? "sem código"}). Reconecte a conta no Meu Pluggy e revincule a aplicação no Dashboard.`,
      );
    }
    return item;
  }

  async accounts(itemId: string): Promise<PluggyAccount[]> {
    const data = await this.get<{ results?: PluggyAccount[] }>("/accounts", { itemId });
    return data.results ?? [];
  }

  // ----------------------------------------------------------- transactions

  /** Transações de uma conta no período, percorrendo a paginação por cursor. */
  async *transactions(accountId: string, from: string, to: string): AsyncGenerator<PluggyTransaction> {
    const base: Record<string, string> = { accountId, dateFrom: from, dateTo: to };
    let params: Record<string, string> = { ...base };

    for (let page = 0; page < MAX_PAGES; page++) {
      let data: { results?: PluggyTransaction[]; next?: string; nextCursor?: string };
      try {
        data = await this.get("/v2/transactions", params);
      } catch (e) {
        // Se a API recusar um parâmetro, removemos o apontado e seguimos: o recorte de
        // datas é reaplicado localmente, então o período pedido vale de qualquer forma.
        const rejected = rejectedProperties(String((e as Error).message)).filter((p) => p in params);
        if (!rejected.length) throw e;
        for (const p of rejected) {
          delete base[p];
          delete params[p];
        }
        continue;
      }

      const results = data.results ?? [];
      for (const t of results) if (withinPeriod(t, from, to)) yield t;

      const cursor = extractCursor(data.next ?? data.nextCursor);
      if (!results.length || !cursor) return;
      params = { ...base, after: cursor };
    }
    throw new PluggyError(`Mais de ${MAX_PAGES} páginas para a conta ${accountId} — cursor provavelmente não está avançando.`);
  }
}
