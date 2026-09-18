"use client";

import { useState } from "react";

import { Section } from "./Section";
import { PRIOR_RECORD } from "@/lib/tips/prior";
import { PERIODS, type Period } from "@/lib/tips/stats";

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}u`;
const dollars = (u: number) => `${u < 0 ? "−" : "+"}$${Math.abs(Math.round(u * 100)).toLocaleString("en-AU")}`;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n * 100).toFixed(1)}%`;
const longDate = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

/** The model's record by window, level stakes, one unit a call. */
export function Record() {
  const [period, setPeriod] = useState<Period>("month");
  const r = PRIOR_RECORD.windows[period];

  return (
    <Section
      id="record"
      letter="Σ"
      title="Results"
      controls={
        <div className="metric-tabs" role="tablist">
          {PERIODS.map((p) => (
            <button key={p.id} role="tab" aria-selected={period === p.id} className="metric-tab" onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      }
      aside={<span className="nums hidden md:inline">To {longDate(PRIOR_RECORD.to)}</span>}
    >
      <div className="section-body">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Units" value={units(r.units)} sub="level stakes, one unit a tip and a tenth on a Way Overlay" accent={r.units >= 0} />
          <Tile label="Tips" value={r.tips.toLocaleString("en-AU")} sub="bets and lays, every call published" />
          <Tile label="Return" value={pct(r.roi)} sub="on turnover" accent={r.roi >= 0} />
          <Tile label="$100 punter" value={dollars(r.units)} sub="profit at $100 a tip" accent={r.units >= 0} />
        </div>
        <p className="mt-2 text-[11px] text-ink-soft">Model record to {longDate(PRIOR_RECORD.to)}, level stakes.</p>
      </div>
    </Section>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? "border-lime bg-lime-soft" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="font-display text-2xl font-extrabold tracking-tight nums mt-1">{value}</div>
      <div className="text-xs text-ink-soft nums mt-1">{sub}</div>
    </div>
  );
}
