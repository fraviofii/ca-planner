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
