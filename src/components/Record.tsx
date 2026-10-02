"use client";

import { useState } from "react";

import { Section } from "./Section";
import { totals, type RecordStats, type SideStats } from "@/lib/tips/stats";

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}u`;
const dollars = (u: number) => `${u < 0 ? "−" : "+"}$${Math.abs(Math.round(u * 100)).toLocaleString("en-AU")}`;
const strike = (s: SideStats) => (s.n ? Math.round((s.hit / s.n) * 100) : 0);
const shortDate = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

const TABS = [
  { id: "all", label: "Since launch" },
  { id: "week", label: "Last 7 days" },
] as const;

/**
 * The live record under the board: the book as a hero with its running line,
 * bets and lays with their strike, and the way through to the full
 * results sheet. Only what is in profit shows: a window
 * or a side in the red is left off, and the section goes when nothing is up
 * (the user, 30 Sep 2026). Strike rates, not returns, so every figure here
 * matches the sheet (2 Oct 2026).
 */
export function Record({ stats, daily }: { stats: RecordStats[]; daily: { date: string; units: number }[] }) {
  const tabs = TABS.filter((p) => (stats.find((s) => s.period === p.id)?.net ?? 0) > 0);
  const [period, setPeriod] = useState(tabs[0]?.id);
  const r = stats.find((s) => s.period === (tabs.some((p) => p.id === period) ? period : tabs[0]?.id));
  if (!r) return null;
  const t = r ? totals(r) : undefined;
  const settled = r ? r.bets.n + r.lays.n : 0;
  const hit = r ? r.bets.hit + r.lays.hit : 0;
  const days = daily.filter((d) => !r?.from || d.date >= r.from);
  // Both sides always show, in the red when they are: a side that comes and goes raises more questions than a loss (2 Oct 2026).
  const sides: [string, SideStats, string, string][] = r ? [["Bets", r.bets, "won", "bg-blue"], ["Lays", r.lays, "held", "bg-red"]] : [];

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
            <div className="col-span-2 rounded-[var(--radius-md)] bg-bar text-bar-ink p-4 pb-20 overflow-hidden relative">
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
              <Spark days={days} />
            </div>
            {sides.map(([label, s, verb, bar]) => {
              // Counts, not rates: 45 winners against the 40 the prices gave, bars scaled to each other, so the gap is what shows.
              const exp = Math.round(s.expected * s.n);
              const diff = s.hit - exp;
              const top = Math.max(s.hit, exp, 1);
              const noun = verb === "won" ? "winners" : "held";
              return (
                <div key={label} className="stat flex flex-col justify-between">
                  <div>
                    <div className="stat-label">{label}</div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 mt-1">
                      <span className={`font-display text-2xl font-extrabold tracking-tight nums ${s.units < 0 ? "text-red" : ""}`}>{units(s.units)}</span>
                      <Pot roi={s.roi} />
                    </div>
                    <div className="text-xs text-ink-soft nums">{s.n} {label.toLowerCase()}, {strike(s)}% {verb}</div>
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs nums">
                    {[
                      [verb === "won" ? "Winners" : "Held", s.hit, bar],
                      ["Prices said", exp, "bg-ink-soft/40"],
                    ].map(([name, v, fill]) => (
                      <div key={name as string}>
                        <div className="flex justify-between">
                          <span className="text-ink-soft">{name}</span>
                          <span className="font-bold">{v}</span>
                        </div>
                        <div className="mt-0.5 h-2 rounded-full bg-line overflow-hidden" aria-hidden>
                          <div className={`h-full rounded-full ${fill}`} style={{ width: `${((v as number) / top) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                    <div className={`pt-0.5 font-semibold ${diff > 0 ? "text-green" : diff < 0 ? "text-red" : "text-ink-soft"}`}>
                      {diff > 0 ? `${diff} more ${noun} than the market expected` : diff < 0 ? `${-diff} fewer ${noun} than the market expected` : "Level with the market"}
                    </div>
                  </div>
                </div>
              );
            })}
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
function Pot({ roi, dark }: { roi: number; dark?: boolean }) {
  const v = `${roi > 0 ? "+" : roi < 0 ? "−" : ""}${Math.abs(roi * 100).toFixed(1)}%`;
  const tone = dark ? "text-lime" : roi > 0 ? "text-green" : roi < 0 ? "text-red" : "text-ink-soft";
  return (
    <span className={`nums font-bold ${dark ? "text-lg" : "text-sm"} ${tone}`} title="Profit on turnover: units won over units staked">
      {v} <span className={`text-[10px] uppercase tracking-[0.08em] ${dark ? "text-bar-soft" : "text-ink-soft"}`}>POT</span>
    </span>
  );
}

/** The running total across the window, an area under the hero's figure. */
function Spark({ days }: { days: { date: string; units: number }[] }) {
  if (days.length < 2) return null;
  const pts = days.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + d.units], []);
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts);
  const W = 300, H = 80;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * (H - 6) - 3;
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-16 w-full" aria-hidden>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-bar-soft)" strokeOpacity="0.35" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="var(--color-lime)" fillOpacity="0.14" />
      <polyline points={line} fill="none" stroke="var(--color-lime)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
