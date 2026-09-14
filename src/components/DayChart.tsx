"use client";

import { useId, useState } from "react";

import type { Series } from "@/lib/reports";

/**
 * One series over the window as thin bars, one per day. Counts and money
 * are ink; a units series splits at zero, lime above and red below. Hover a
 * bar for the day and the value. Text stays in ink tokens, never the bar colour.
 */
const W = 640, H = 180, PAD = { t: 12, r: 8, b: 26, l: 44 };

const INK = "#14161a", BLUE = "#1f6fd6", UP = "#6f9a12", DOWN = "#d93636";

export function fmt(v: number, format: Series["format"]): string {
  if (format === "money") return `$${v.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (format === "units") return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}u`;
  return v.toLocaleString("en-AU");
}

const short = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/** Round tick step so the axis reads 0, 5, 10 rather than 0, 4.3, 8.6. */
function ticks(max: number, min: number): number[] {
  const span = Math.max(1, max - min);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export function DayChart({ s, cumulative }: { s: Series; cumulative?: boolean }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const pts = cumulative
    ? s.points.reduce<{ date: string; value: number }[]>((acc, p) => [...acc, { date: p.date, value: Math.round(((acc.at(-1)?.value ?? 0) + p.value) * 100) / 100 }], [])
    : s.points;
  const max = Math.max(0, ...pts.map((p) => p.value));
  const min = Math.min(0, ...pts.map((p) => p.value));
  const tk = ticks(max || 1, min);
  const top = Math.max(max, tk.at(-1) ?? 0, 1e-9), bottom = Math.min(min, tk[0] ?? 0);
  const plotH = H - PAD.t - PAD.b, plotW = W - PAD.l - PAD.r;
  const y = (v: number) => PAD.t + ((top - v) / (top - bottom)) * plotH;
  const n = pts.length;
  const slot = plotW / n;
  const bw = Math.max(2, Math.min(14, slot - 2));
  const zero = y(0);
  const colour = (v: number) => (s.diverging ? (v >= 0 ? UP : DOWN) : s.format === "money" ? BLUE : INK);
  const h = hover !== null ? pts[hover] : null;
  const labelEvery = n > 40 ? 14 : n > 14 ? 7 : 1;

  return (
    <figure className="m-0">
      <figcaption className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-[11px] uppercase tracking-[0.08em] font-extrabold text-ink-soft">{s.title}{cumulative ? ", running total" : ""}</span>
        <span className="nums text-sm font-semibold">{h ? `${short(h.date)}: ${fmt(h.value, s.format)}` : `${fmt(s.total, s.format)} in the window`}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setHover(null)}>
        <title id={`${id}-t`}>{s.title} by day</title>
        {tk.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#c9cec4" : "#ecefe8"} strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="#8b918a" fontFamily="var(--font-mono)">{fmt(v, s.format)}</text>
          </g>
        ))}
        {pts.map((p, i) => {
          const x = PAD.l + i * slot + (slot - bw) / 2;
          const yy = p.value >= 0 ? y(p.value) : zero;
          const hh = Math.abs(y(p.value) - zero);
          return (
            <g key={p.date} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={plotH} fill="transparent" />
              {hh > 0 && <rect x={x} y={yy} width={bw} height={Math.max(1, hh)} rx={Math.min(2, bw / 2)} fill={colour(p.value)} opacity={hover === null || hover === i ? 1 : 0.45} />}
              {i % labelEvery === 0 && (
                <text x={PAD.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#8b918a" fontFamily="var(--font-mono)">{short(p.date)}</text>
              )}
            </g>
          );
        })}
        {h && hover !== null && (
          <line x1={PAD.l + hover * slot + slot / 2} x2={PAD.l + hover * slot + slot / 2} y1={PAD.t} y2={H - PAD.b} stroke="#14161a" strokeWidth={1} strokeDasharray="2 3" pointerEvents="none" />
        )}
      </svg>
    </figure>
  );
}

/** The table view of the same numbers, for anyone who wants them exactly. */
export function DayTable({ series }: { series: Series[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table text-xs">
        <thead><tr><th>Day</th>{series.map((s) => <th key={s.key} className="text-right">{s.title}</th>)}</tr></thead>
        <tbody>
          {series[0].points.map((_, i) => (
            <tr key={series[0].points[i].date}>
              <td className="nums">{short(series[0].points[i].date)}</td>
              {series.map((s) => <td key={s.key} className="text-right nums">{fmt(s.points[i].value, s.format)}</td>)}
            </tr>
          ))}
          <tr className="font-semibold"><td>Total</td>{series.map((s) => <td key={s.key} className="text-right nums">{fmt(s.total, s.format)}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}
