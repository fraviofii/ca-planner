"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CashFlowDayDto } from "@/lib/client";
import { formatDay } from "@/lib/dates";
import { formatCents, formatCentsShort } from "@/lib/money";

// Paleta validada para a superfície branca do card (ver skill dataviz).
const SERIES = "#2a78d6";
const CRITICAL = "#d03b3b";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";
const MUTED = "#898781";
const SURFACE = "#ffffff";

const MARGIN = { top: 20, right: 76, bottom: 30, left: 70 };
const PLOT_HEIGHT = 250;
const MIN_WIDTH = 360;

export function CashFlowChart({ days, today }: { days: CashFlowDayDto[]; today: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(MIN_WIDTH, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => layout(days, width), [days, width]);
  if (!days.length || !geom) return null;

  const { x, y, plotW, lo, hi, yTicks, xTicks, height } = geom;
  const todayIndex = Math.max(0, days.findIndex((d) => d.day === today));
  const last = days[days.length - 1];
  const lowest = days.reduce((min, d) => (d.balanceCents < min.balanceCents ? d : min), days[0]);
  const showsZero = lo < 0 && hi > 0;

  const line = (slice: CashFlowDayDto[], offset: number) =>
    slice.map((d, i) => `${i ? "L" : "M"}${x(offset + i).toFixed(1)},${y(d.balanceCents).toFixed(1)}`).join(" ");

  const cursor = hover === null ? null : days[hover];

  return (
    <div ref={box} className="relative w-full">
      <svg
        width={width}
        height={height}
        role="img"
        tabIndex={0}
        aria-label={`Saldo diário de ${formatDay(days[0].day)} a ${formatDay(last.day)}. Real até ${formatDay(today)}, previsto depois. Termina em ${formatCents(last.balanceCents)}.`}
        className="touch-none outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            setHover((h) => Math.min(days.length - 1, Math.max(0, (h ?? todayIndex) + (e.key === "ArrowRight" ? 1 : -1))));
          } else if (e.key === "Escape") setHover(null);
        }}
        onBlur={() => setHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
            <text x={MARGIN.left - 10} y={y(v) + 4} textAnchor="end" fontSize={11} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatCentsShort(v)}
            </text>
          </g>
        ))}

        {showsZero && <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(0)} y2={y(0)} stroke={AXIS} strokeWidth={1} />}

        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={height - 10} textAnchor="middle" fontSize={11} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
            {Number(days[i].day.slice(8, 10))}
          </text>
        ))}

        {/* fronteira entre o que aconteceu e o que é previsão */}
        <line x1={x(todayIndex)} x2={x(todayIndex)} y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT} stroke={AXIS} strokeWidth={1} />
        <text x={x(todayIndex) + 4} y={MARGIN.top - 7} fontSize={11} fill={MUTED}>
          hoje
        </text>

        <path d={line(days.slice(0, todayIndex + 1), 0)} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path
          d={line(days.slice(todayIndex), todayIndex)}
          fill="none"
          stroke={SERIES}
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {lowest.balanceCents < 0 && (
          <g>
            <circle cx={x(days.indexOf(lowest))} cy={y(lowest.balanceCents)} r={4.5} fill={CRITICAL} stroke={SURFACE} strokeWidth={2} />
            <text x={x(days.indexOf(lowest))} y={y(lowest.balanceCents) + 20} textAnchor="middle" fontSize={11} fill={CRITICAL} fontWeight={600}>
              {formatCentsShort(lowest.balanceCents)}
            </text>
          </g>
        )}

        <circle cx={x(days.length - 1)} cy={y(last.balanceCents)} r={4.5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
        <text x={x(days.length - 1) + 10} y={y(last.balanceCents) + 4} fontSize={12} fill="#0b0b0b" fontWeight={600}>
          {formatCentsShort(last.balanceCents)}
        </text>

        {cursor && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT} stroke={MUTED} strokeWidth={1} />
            <circle cx={x(hover!)} cy={y(cursor.balanceCents)} r={4.5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
          </g>
        )}

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={plotW}
          height={PLOT_HEIGHT}
          fill="transparent"
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
            setHover(Math.min(days.length - 1, Math.max(0, Math.round(ratio * (days.length - 1)))));
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {cursor && (
        <div
          className="pointer-events-none absolute z-10 w-44 rounded-md border border-slate-200 bg-white p-2 text-sm shadow-lg"
          style={{ left: Math.min(width - 180, Math.max(0, x(hover!) - 88)), top: 8 }}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="tabular-nums">{formatDay(cursor.day)}</span>
            <span className={cursor.projected ? "text-violet-700" : "text-slate-500"}>{cursor.projected ? "previsto" : "real"}</span>
          </div>
          <div className={`mt-0.5 font-semibold tabular-nums ${cursor.balanceCents < 0 ? "text-rose-700" : "text-slate-900"}`}>
            {formatCents(cursor.balanceCents)}
          </div>
          <div className="text-xs text-slate-500">
            {cursor.movementCents ? (
              <>
                {cursor.projected ? "movimento previsto" : "movimento do dia"}{" "}
                <span className="tabular-nums">{formatCents(cursor.movementCents)}</span>
              </>
            ) : (
              "sem movimento"
            )}
          </div>
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <line x1="1" y1="3" x2="21" y2="3" stroke={SERIES} strokeWidth={2} strokeLinecap="round" />
          </svg>
          realizado (transações)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <line x1="1" y1="3" x2="21" y2="3" stroke={SERIES} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
          </svg>
          previsto (planejamento)
        </span>
        <span className="text-slate-400">setas ← → percorrem os dias</span>
      </div>
    </div>
  );
}

/** Escalas, ticks e medidas do desenho. */
function layout(days: CashFlowDayDto[], width: number) {
  if (days.length < 2) return null;
  const plotW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const height = MARGIN.top + PLOT_HEIGHT + MARGIN.bottom;

  const values = days.map((d) => d.balanceCents);
  let lo = Math.min(...values);
  const top = Math.max(...values);
  // Encosta no zero quando o saldo já anda perto dele — é a distância que interessa ler.
  const snapZero = lo > 0 && lo <= top * 0.35;
  if (snapZero) lo = 0;
  const span = top - lo || Math.abs(top) || 100_000;
  const hi = top + span * 0.12;
  lo -= snapZero ? 0 : span * 0.12;

  const x = (i: number) => MARGIN.left + (plotW * i) / (days.length - 1);
  const y = (v: number) => MARGIN.top + PLOT_HEIGHT - (PLOT_HEIGHT * (v - lo)) / (hi - lo);

  const xTicks = days.map((d, i) => i).filter((i) => {
    const dayOfMonth = Number(days[i].day.slice(8, 10));
    return dayOfMonth === 1 || dayOfMonth % 5 === 0 || i === days.length - 1;
  });

  return { x, y, plotW, lo, hi, height, xTicks, yTicks: niceTicks(lo, hi) };
}

/** Valores redondos para o eixo, 4 divisões aproximadas. */
function niceTicks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Math.round(v) || 0);
  return out;
}
