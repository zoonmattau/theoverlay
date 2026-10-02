"use client";

import { useState } from "react";

import { Section } from "./Section";
import { totals, type RecordStats, type SideStats } from "@/lib/tips/stats";

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}u`;
const dollars = (u: number) => `${u < 0 ? "−" : "+"}$${Math.abs(Math.round(u * 100)).toLocaleString("en-AU")}`;
const shortDate = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

const TABS = [
  { id: "all", label: "Since launch" },
  { id: "month", label: "30 days" },
  { id: "fortnight", label: "14 days" },
  { id: "week", label: "7 days" },
] as const;

/**
 * The live record under the board: the book as a hero with its running line,
 * bets and lays with their units and POT, and the way through to the full
 * results sheet. Only what is in profit shows: a window
 * or a side in the red is left off, and the section goes when nothing is up
 * (the user, 30 Sep 2026). Strike rates, not returns, so every figure here
 * matches the sheet (2 Oct 2026).
 */
type Day = { date: string; units: number; bets: number; lays: number };

export function Record({ stats, daily }: { stats: RecordStats[]; daily: Day[] }) {
  const tabs = TABS.filter((p) => (stats.find((s) => s.period === p.id)?.net ?? 0) > 0);
  const [period, setPeriod] = useState(tabs[0]?.id);
  const r = stats.find((s) => s.period === (tabs.some((p) => p.id === period) ? period : tabs[0]?.id));
  if (!r) return null;
  const t = r ? totals(r) : undefined;
  const settled = r ? r.bets.n + r.lays.n : 0;
  const hit = r ? r.bets.hit + r.lays.hit : 0;
  const days = daily.filter((d) => !r?.from || d.date >= r.from);
  // Both sides always show, in the red when they are: a side that comes and goes raises more questions than a loss (2 Oct 2026).
  // Each side is its units and POT on its call colour, over its own running line (2 Oct 2026).
  const sides: [string, SideStats, "bets" | "lays", string][] = r ? [["Bets", r.bets, "bets", "bg-blue"], ["Lays", r.lays, "lays", "bg-red"]] : [];

  return (
    <Section
      id="record"
      letter="Σ"
      title="Results"
      controls={
        tabs.length > 1 && (
          <div className="metric-tabs" role="tablist">
            {tabs.map((p) => (
              <button key={p.id} role="tab" aria-selected={r?.period === p.id} className="metric-tab" onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        )
      }
      aside={r?.since && <span className="nums hidden md:inline">{tabs.length === 1 ? tabs[0].label : `${r.period === "all" ? "Live since" : "From"} ${shortDate(r.since)}`}</span>}
    >
      <div className="section-body space-y-4">
        {r && t && (
          <div className={`grid gap-2 grid-cols-2 ${sides.length ? "lg:grid-cols-4" : ""}`}>
            {/* Two by two on a wide screen: all calls and bets, the running total and lays. */}
            <div className="col-span-2 lg:order-1 rounded-[var(--radius-md)] bg-bar text-bar-ink p-4 pb-20 overflow-hidden relative">
              <div className="relative z-10">
                <div className="text-[11px] uppercase tracking-[0.1em] font-bold text-lime">All calls</div>
                <div className="flex flex-wrap items-baseline gap-x-3 mt-1">
                  <span className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight nums text-lime">{units(t.units)}</span>
                  <Pot roi={t.roi} dark />
                </div>
                <div className="text-xs text-bar-soft nums mt-1">
                  {settled.toLocaleString("en-AU")} settled, {settled ? Math.round((hit / settled) * 100) : 0}% won. <span className="text-bar-ink font-semibold">{dollars(t.units)}</span> at $100 a unit.
                </div>
              </div>
              <Spark values={days.map((d) => d.units)} />
            </div>
            {sides.map(([label, s, key, bg]) => (
              <div key={label} className={`lg:col-span-2 ${key === "bets" ? "lg:order-2" : "lg:order-4"} rounded-[var(--radius-md)] ${bg} text-white p-4 pb-14 overflow-hidden relative`}>
                <div className="relative z-10">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.1em] font-bold text-white/80">{label}</span>
                    <span className="text-xs nums text-white/80">{s.n.toLocaleString("en-AU")} {label.toLowerCase()}</span>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 mt-1">
                    <span className="font-display text-3xl font-extrabold tracking-tight nums">{units(s.units)}</span>
                    <Pot roi={s.roi} light />
                  </div>
                </div>
                <Spark values={days.map((d) => d[key])} light />
              </div>
            ))}
            <div className="col-span-2 lg:order-3 rounded-[var(--radius-md)] border border-line p-4">
              <Columns days={days.map((d) => ({ date: d.date, units: d.units }))} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          <span>Level stakes, one unit a call. Voids left out.</span>
          <a href="/results" target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
            Every result in the sheet
          </a>
        </div>
      </div>
    </Section>
  );
}

/** Profit on turnover: units won over units staked, a lay staking the unit it wins. */
function Pot({ roi, dark, light }: { roi: number; dark?: boolean; light?: boolean }) {
  const v = `${roi > 0 ? "+" : roi < 0 ? "−" : ""}${Math.abs(roi * 100).toFixed(1)}%`;
  const tone = dark ? "text-lime" : light ? "text-white" : roi > 0 ? "text-green" : roi < 0 ? "text-red" : "text-ink-soft";
  return (
    <span className={`nums font-bold ${dark || light ? "text-lg" : "text-sm"} ${tone}`} title="Profit on turnover: units won over units staked">
      {v} <span className={`text-[10px] uppercase tracking-[0.08em] ${dark ? "text-bar-soft" : light ? "text-white/70" : "text-ink-soft"}`}>POT</span>
    </span>
  );
}

/**
 * Bets and lays together, each race day's units as a column, the shape of the
 * admin reports (DayChart): green for a winning day, red for a losing one.
 * The running total is the hero's line; this is the days behind it. Hover or
 * tap a column for the day.
 */
function Columns({ days }: { days: { date: string; units: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (days.length < 2) return null;
  const pts = days.map((d) => ({ date: d.date, total: d.units }));
  const up = pts.filter((p) => p.total > 0).length;
  const lo = Math.min(0, ...pts.map((p) => p.total)), hi = Math.max(0, ...pts.map((p) => p.total));
  const W = 600, H = 96;
  const y = (v: number) => ((hi - v) / (hi - lo || 1)) * H;
  const slot = W / pts.length;
  const bw = Math.max(1.5, slot * 0.7);
  const h = hover !== null ? pts[hover] : pts.at(-1)!;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="stat-label">By day</span>
        <span className="nums text-sm font-bold">
          {hover === null ? (
            <>
              {up} of {pts.length} days up
            </>
          ) : (
            <>
              {shortDate(h.date)}: <span className={h.total < 0 ? "text-red" : "text-green"}>{units(h.total)}</span>
            </>
          )}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-24" onMouseLeave={() => setHover(null)} aria-hidden>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => (
          <g key={p.date} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
            <rect x={i * slot} y="0" width={slot} height={H} fill="transparent" />
            <rect
              x={i * slot + (slot - bw) / 2}
              y={Math.min(y(p.total), y(0))}
              width={bw}
              height={Math.max(1, Math.abs(y(p.total) - y(0)))}
              fill={p.total < 0 ? "var(--color-red)" : "var(--color-green)"}
              opacity={hover === null || hover === i ? 1 : 0.4}
            />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] nums text-ink-soft">
        <span>{shortDate(pts[0].date)}</span>
        <span>{shortDate(pts.at(-1)!.date)}</span>
      </div>
    </div>
  );
}

/** The running total across the window, an area under the hero's figure. */
function Spark({ values, light }: { values: number[]; light?: boolean }) {
  if (values.length < 2) return null;
  const pts = values.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], []);
  const ink = light ? "#fff" : "var(--color-lime)";
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts);
  const W = 300, H = 80;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * (H - 6) - 3;
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`absolute inset-x-0 bottom-0 w-full ${light ? "h-10" : "h-16"}`} aria-hidden>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke={light ? "#fff" : "var(--color-bar-soft)"} strokeOpacity="0.35" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={ink} fillOpacity={light ? 0.18 : 0.14} />
      <polyline points={line} fill="none" stroke={ink} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
