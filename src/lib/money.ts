/** Converte um valor decimal (ex.: 94.0, "-12,34") para centavos inteiros com sinal. */
export function toCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

const brlShort = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

/** Forma curta para eixos e rótulos apertados: "R$ 5,8 mil". */
export function formatCentsShort(cents: number): string {
  return brlShort.format(cents / 100);
}
