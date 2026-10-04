"use client";

import { useId, useState } from "react";

import type { AccessDay, AccessGroup } from "@/lib/access-history";

/**
 * People with the board each racing day, stacked by how they had it: paying
 * at the base, then trial, day pass and gift. One bar a day, a 2px gap between
 * segments, hover a day for its breakdown. Colours passed the palette check
 * (lightness, chroma, colour-blind separation, contrast) on the light surface.
 */
const GROUPS: { key: AccessGroup; label: string; colour: string }[] = [
  { key: "paying", label: "Paying", colour: "#1f6fd6" },
  { key: "trial", label: "Trial", colour: "#6f9a12" },
  { key: "pass", label: "Day pass", colour: "#b45309" },
  { key: "gift", label: "Gift", colour: "#7c3aed" },
];

const W = 640, H = 220, PAD = { t: 12, r: 8, b: 26, l: 32 };
const GAP = 2;

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", timeZone: "Australia/Sydney" });

function ticks(max: number): number[] {
  const raw = Math.max(1, max) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  if ((out.at(-1) ?? 0) < max) out.push((out.at(-1) ?? 0) + step);
  return out;
}

export function AccessChart({ days }: { days: AccessDay[] }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const tk = ticks(Math.max(...days.map((d) => d.total), 1));
  const top = tk.at(-1) ?? 1;
  const plotH = H - PAD.t - PAD.b, plotW = W - PAD.l - PAD.r;
  const y = (v: number) => PAD.t + ((top - v) / top) * plotH;
  const slot = plotW / days.length;
  const bw = Math.max(3, Math.min(16, slot - 3));
  const labelEvery = days.length > 40 ? 14 : 7;
  const h = hover !== null ? days[hover] : days.at(-1);
  const peak = days.reduce((a, d) => (d.total > a.total ? d : a), days[0]);

  return (
    <figure className="m-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
        <span className="text-[11px] uppercase tracking-[0.08em] font-extrabold text-ink-soft">People with the board, by day</span>
        {h && (
          <span className="nums text-sm">
            <strong>{weekday(h.date)} {short(h.date)}: {h.total}</strong>
            <span className="text-ink-soft"> · {GROUPS.filter((g) => h.counts[g.key]).map((g) => `${h.counts[g.key]} ${g.label.toLowerCase()}`).join(", ") || "nobody"}</span>
          </span>
        )}
      </figcaption>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-ink-secondary">
        {GROUPS.map((g) => (
          <span key={g.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: g.colour }} />
            {g.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setHover(null)}>
        <title id={`${id}-t`}>{`People with the board by day, peak ${peak?.total ?? 0} on ${peak ? short(peak.date) : ""}`}</title>
        {tk.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#c9cec4" : "#ecefe8"} strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="#8b918a" fontFamily="var(--font-mono)">{v}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = PAD.l + i * slot + (slot - bw) / 2;
          let base = 0;
          const segs = GROUPS.filter((g) => d.counts[g.key] > 0).map((g, j, shown) => {
            const y0 = y(base), y1 = y(base + d.counts[g.key]);
            base += d.counts[g.key];
            // A surface gap between segments; the top segment gets the rounded end.
            const hh = Math.max(1, y0 - y1 - (j > 0 ? GAP : 0));
            return <rect key={g.key} x={x} y={y1} width={bw} height={hh} rx={j === shown.length - 1 ? Math.min(3, bw / 2) : 0} fill={g.colour} opacity={hover === null || hover === i ? 1 : 0.45} />;
          });
          const sat = new Date(`${d.date}T12:00:00Z`).getUTCDay() === 6;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={plotH} fill="transparent" />
              {segs}
              {(i % labelEvery === 0 || i === days.length - 1) && (
                <text x={PAD.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#8b918a" fontFamily="var(--font-mono)">{short(d.date)}</text>
              )}
              {sat && <circle cx={PAD.l + i * slot + slot / 2} cy={H - PAD.b + 5} r={1.6} fill="#8b918a" />}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-ink-soft">Dots under the axis mark Saturdays. Saturday-only plans count only on Saturdays.</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink-soft">The numbers</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="table text-sm nums">
            <thead>
              <tr>
                <th>Day</th>
                {GROUPS.map((g) => <th key={g.key} className="text-right">{g.label}</th>)}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.date}>
                  <td>{weekday(d.date)} {short(d.date)}</td>
                  {GROUPS.map((g) => <td key={g.key} className="text-right">{d.counts[g.key] || ""}</td>)}
                  <td className="text-right font-semibold">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
