import { formatCents } from "@/lib/money";

export function Money({ cents, signed = true, className = "" }: { cents: number; signed?: boolean; className?: string }) {
  const tone = cents > 0 ? "money-pos" : cents < 0 ? "money-neg" : "text-slate-500";
  return (
    <span className={`tabular-nums ${signed ? tone : ""} ${className}`}>
      {formatCents(cents)}
    </span>
  );
}
