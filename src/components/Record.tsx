"use client";

import Link from "next/link";
import { useState } from "react";

import { Section } from "./Section";
import { totals, type RecordStats, type SideStats, type Winner } from "@/lib/tips/stats";

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}u`;
const dollars = (u: number) => `${u < 0 ? "−" : "+"}$${Math.abs(Math.round(u * 100)).toLocaleString("en-AU")}`;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n * 100).toFixed(1)}%`;
const shortDate = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

const TABS = [
  { id: "all", label: "Since launch" },
  { id: "week", label: "Last 7 days" },
] as const;

const COLS: { [tiles: number]: string } ={ 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };

/**
 * The live record, settled on the ledger, and the bets that paid most. Only
 * what is in profit shows: a window or a side in the red is left off, and the
 * section goes when nothing is up (the user, 30 Sep 2026).
 */
export function Record({ stats, winners }: { stats: RecordStats[]; winners: Winner[] }) {
  const tabs = TABS.filter((p) => (stats.find((s) => s.period === p.id)?.net ?? 0) > 0);
  const [period, setPeriod] = useState(tabs[0]?.id);
  const r = stats.find((s) => s.period === (tabs.some((p) => p.id === period) ? period : tabs[0]?.id));
  if (!r && !winners.length) return null;
  const t = r ? totals(r) : undefined;
  const tiles = r && t
    ? [
        <Tile key="u" label="Units" value={units(t.units)} sub={`${t.calls.toLocaleString("en-AU")} calls, ${dollars(t.units)} at $100 a unit`} accent wide={[r.bets.units, r.lays.units].filter((u) => u > 0).length === 1} />,
        <Tile key="r" label="Return" value={pct(t.roi)} sub="on turnover" accent />,
        r.bets.units > 0 && <Tile key="b" label="Bets" value={units(r.bets.units)} sub={side(r.bets, "won")} />,
        r.lays.units > 0 && <Tile key="l" label="Lays" value={units(r.lays.units)} sub={side(r.lays, "held")} />,
      ].filter(Boolean)
    : [];

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
      aside={r?.since && <span className="nums hidden md:inline">{tabs.length === 1 ? tabs[0].label : `Live since ${shortDate(r.since)}`}</span>}
    >
      <div className="section-body">
        {tiles.length > 0 && <div className={`grid grid-cols-2 gap-2 ${COLS[tiles.length] ?? ""}`}>{tiles}</div>}
        {winners.length > 0 && (
          <>
            <h3 className={`${tiles.length ? "mt-4" : ""} mb-2 text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft`}>Big winners</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {winners.map((w) => (
                <Link key={w.href + w.horse} href={w.href} className="stat card-hover block min-w-0 border-blue bg-blue-soft">
                  <div className="font-display font-extrabold truncate">{w.horse}</div>
                  <div className="font-display text-xl font-extrabold tracking-tight nums">${w.price.toFixed(2)}</div>
                  <div className="text-xs text-ink-soft truncate">{w.race}</div>
                  <div className="text-xs text-ink-soft nums">{shortDate(w.date)}</div>
                  <div className="text-xs font-bold nums">{units(w.units)}</div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

const side = (s: SideStats, verb: string) => `${s.hit} of ${s.n} ${verb}, ${pct(s.roi)}`;

/** `wide` takes the whole first row on a phone, so three tiles do not leave a gap. */
function Tile({ label, value, sub, accent, wide }: { label: string; value: string; sub: string; accent?: boolean; wide?: boolean }) {
  return (
    <div className={`stat ${accent ? "border-lime bg-lime-soft" : ""} ${wide ? "col-span-2 lg:col-span-1" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="font-display text-2xl font-extrabold tracking-tight nums mt-1">{value}</div>
      <div className="text-xs text-ink-soft nums mt-1">{sub}</div>
    </div>
  );
}
