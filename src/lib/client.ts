/** Utilitários do lado do navegador: fetch com erro legível e tipos das respostas da API. */

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new ApiError((body as { error?: string }).error ?? `HTTP ${resp.status}`, resp.status);
  return body as T;
}

export interface CategoryRef {
  id: string;
  name: string;
  group: { id: string; name: string };
}

export interface CategoryGroupDto {
  id: string;
  name: string;
  sortOrder: number;
  categories: Array<{ id: string; name: string; sortOrder: number; count: number }>;
}

export interface AccountDto {
  id: string;
  externalId: string;
  name: string;
  bankName: string | null;
  type: string;
  subtype: string | null;
  number: string | null;
  balanceCents: number | null;
  ignored: boolean;
  connection: { id: string; nickname: string } | null;
  transactions: number;
}

export interface TransactionDto {
  id: string;
  externalId: string;
  day: string;
  amountCents: number;
  description: string;
  counterparty: string | null;
  providerCategory: string | null;
  providerType: string | null;
  status: string | null;
  categoryId: string | null;
  category: CategoryRef | null;
  isTransfer: boolean;
  notes: string | null;
  account: { id: string; name: string; bankName: string | null };
}

export interface TransactionsResponse {
  transactions: TransactionDto[];
  totals: { incomeCents: number; expenseCents: number; netCents: number; count: number; shown: number; limit: number };
  /** Saldo no fim de cada dia (chave "AAAA-MM-DD"); null quando alguma conta não tem saldo conhecido. */
  balances: { byDay: Record<string, number>; accountCount: number } | null;
}

export interface SummaryResponse {
  totals: { incomeCents: number; expenseCents: number; netCents: number; transferCents: number; count: number; uncategorized: number };
  groups: Array<{
    id: string | null;
    name: string;
    incomeCents: number;
    expenseCents: number;
    count: number;
    categories: Array<{ id: string | null; name: string; incomeCents: number; expenseCents: number; count: number }>;
  }>;
  accounts: Array<{ id: string; name: string; incomeCents: number; expenseCents: number; count: number }>;
}

export interface ConnectionDto {
  id: string;
  itemId: string;
  nickname: string;
  status: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    subtype: string | null;
    balanceCents: number | null;
    ignored: boolean;
    transactions: number;
  }>;
}

export interface SyncResultDto {
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

export interface ImportResultDto {
  file: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  accounts: string[];
  errors: string[];
}

export interface PlanOccurrenceDto {
  itemId: string;
  day: string;
  description: string;
  amountCents: number;
  categoryId: string | null;
  category: CategoryRef | null;
  accountId: string | null;
  account: { id: string; name: string } | null;
  notes: string | null;
  recurrence: "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  seriesStartDay: string;
  seriesEndDay: string | null;
  overridden: boolean; // esta ocorrência foi editada só para este dia
}

export interface PlanBucket {
  id: string | null;
  name: string;
  incomeCents: number;
  expenseCents: number;
  count: number;
}

export interface PlanResponse {
  month: string;
  editable: boolean; // false fora do mês corrente: a página fica só de leitura
  occurrences: PlanOccurrenceDto[];
  totals: { incomeCents: number; expenseCents: number; netCents: number; count: number };
  groups: Array<PlanBucket & { categories: PlanBucket[] }>;
  accounts: PlanBucket[];
}

export interface PlanOccurrenceResponse {
  occurrence: PlanOccurrenceDto;
  editable: boolean;
}

export interface PlanMatchDto {
  itemId: string;
  day: string; // dia em que estava previsto
  description: string; // descrição do item de planejamento
  source: "auto" | "manual"; // palpite do sistema ou marcação sua
  dayDiff: number; // dias entre o previsto e o realizado
}

export interface CashFlowEntryDto {
  transactionId?: string; // só nas linhas realizadas
  itemId?: string; // só nas linhas previstas
  description: string;
  accountId: string | null;
  accountName: string | null; // null nos itens de planejamento sem conta
  amountCents: number;
  plan: PlanMatchDto | null; // o item previsto que esta transação cumpriu
}

export interface CashFlowDayDto {
  day: string;
  balanceCents: number;
  movementCents: number;
  projected: boolean; // depois de hoje: vem do planejamento
  entries: CashFlowEntryDto[]; // transações do dia, ou itens previstos
}

export interface CashFlowResponse {
  month: string;
  today: string;
  available: boolean;
  reason?: string;
  scope: { accountId: string | null; accountName: string | null; accountCount: number };
  days: CashFlowDayDto[];
  planOptions: Array<{ itemId: string; day: string; description: string; amountCents: number; accountName: string | null }>;
  summary: {
    todayCents: number;
    endCents: number;
    plannedIncomeCents: number;
    plannedExpenseCents: number;
    lowestCents: number;
    lowestDay: string;
    ignoredPlan: { count: number; cents: number };
    unassignedPlan: { count: number; cents: number };
  } | null;
}
