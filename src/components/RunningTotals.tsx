"use client";

import { useId, useState } from "react";

/**
 * Money in against money out, as running totals since the first day: two
 * lines on one dollar axis, revenue in blue, invested in amber. Hover a day
 * for both figures and the gap. Text stays in ink, never the line colour.
 */
const W = 640, H = 200, PAD = { t: 14, r: 10, b: 24, l: 48 };
const SERIES = [
  { key: "revenue", label: "Revenue, after Stripe fees", colour: "#1f6fd6" },
  { key: "invested", label: "Invested", colour: "#b45309" },
] as const;

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
const dollars = (v: number) => `$${Math.round(v).toLocaleString("en-AU")}`;

function ticks(max: number): number[] {
  const raw = Math.max(1, max) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? mag * 10;
  const out = [0];
  while ((out.at(-1) ?? 0) < max) out.push((out.at(-1) ?? 0) + step);
  return out;
}

export function RunningTotals({ days }: { days: { date: string; invested: number; revenue: number }[] }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (days.length < 2) return null;
  const tk = ticks(Math.max(...days.map((d) => Math.max(d.invested, d.revenue)), 1));
  const top = tk.at(-1) ?? 1;
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / (days.length - 1)) * plotW;
  const y = (v: number) => PAD.t + ((top - v) / top) * plotH;
  const path = (k: "invested" | "revenue") => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join("");
  const h = days[hover ?? days.length - 1];
  const gap = h.revenue - h.invested;
  const labelEvery = Math.max(1, Math.ceil(days.length / 6));

  return (
    <figure className="m-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
        <span className="text-[11px] uppercase tracking-[0.08em] font-extrabold text-ink-soft">Running totals</span>
        <span className="nums text-sm">
          <strong>{short(h.date)}</strong>: {dollars(h.revenue)} in, {dollars(h.invested)} out,{" "}
          <strong>{gap >= 0 ? `${dollars(gap)} ahead` : `${dollars(-gap)} behind`}</strong>
        </span>
      </figcaption>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-ink-secondary">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.colour }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-labelledby={`${id}-t`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(days.length - 1, Math.round(((px - PAD.l) / plotW) * (days.length - 1)))));
        }}
      >
        <title id={`${id}-t`}>{`Revenue ${dollars(days.at(-1)!.revenue)} against ${dollars(days.at(-1)!.invested)} invested`}</title>
        {tk.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#c9cec4" : "#ecefe8"} strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="#8b918a" fontFamily="var(--font-mono)">{dollars(v)}</text>
          </g>
        ))}
        {days.map((d, i) =>
          i % labelEvery === 0 || i === days.length - 1 ? (
            <text key={d.date} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} fontSize={10} fill="#8b918a" fontFamily="var(--font-mono)">{short(d.date)}</text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#c9cec4" strokeWidth={1} />}
        {SERIES.map((s) => (
          <path key={s.key} d={path(s.key)} fill="none" stroke={s.colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {SERIES.map((s) => (
          <circle key={s.key} cx={x(hover ?? days.length - 1)} cy={y(h[s.key])} r={4} fill={s.colour} stroke="#fff" strokeWidth={2} />
        ))}
      </svg>
    </figure>
  );
}
