"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export interface StripRace {
  raceId: string;
  href: string;
  track: string;
  raceNumber: number;
  name: string;
  /** Runners with a full benchmark, and runners in the race. */
  full: number;
  runners: number;
  /** Runners with a run fetched at all. */
  fetched: number;
}

/** How much of a race the review can see: full, part, or nothing yet. */
export function coverage(r: { full: number; runners: number; fetched: number }): "full" | "partial" | "none" {
  if (r.runners && r.full >= r.runners * 0.8) return "full";
  if (r.fetched > 0) return "partial";
  return "none";
}

const CHIP: Record<ReturnType<typeof coverage>, string> = {
  full: "bg-lime border-lime text-ink",
  partial: "bg-amber-100 border-amber-300 text-ink",
  none: "bg-transparent border-line text-ink-soft",
};

/**
 * Sticks under the site header on the race review page: the race, previous
 * and next, every race of the day as a chip coloured by how much data it
 * has, and the legend for those colours.
 */
export function RaceStrip({ races, current }: { races: StripRace[]; current: string }) {
  const [top, setTop] = useState(0);
  useEffect(() => {
    const head = document.querySelector<HTMLElement>(".site-head");
    const measure = () => setTop(head?.offsetHeight ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const i = races.findIndex((r) => r.raceId === current);
  const race = races[i];
  const prev = races[i - 1];
  const next = races[i + 1];
  if (!race) return null;
  const meetings = new Map<string, StripRace[]>();
  for (const r of races) meetings.set(r.track, [...(meetings.get(r.track) ?? []), r]);
  return (
    <div className="sticky z-40 -mx-4 px-4 py-2 bg-bg border-b border-line" style={{ top }}>
      <div className="flex items-center gap-3 flex-wrap">
        {prev ? (
          <Link href={prev.href} className="btn btn-secondary btn-sm whitespace-nowrap">← {prev.track} R{prev.raceNumber}</Link>
        ) : (
          <span className="btn btn-secondary btn-sm opacity-40 whitespace-nowrap">← none</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold leading-tight truncate">
            {race.track} R{race.raceNumber} <span className="text-ink-soft font-bold">{race.name}</span>
          </div>
          <div className="text-xs text-ink-soft nums">{race.full} of {race.runners} runners with full data</div>
        </div>
        <div className="hidden md:flex items-center gap-3 text-[11px] text-ink-soft">
          <span className="flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded-full border ${CHIP.full}`} /> Full</span>
          <span className="flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded-full border ${CHIP.partial}`} /> Partial</span>
          <span className="flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded-full border ${CHIP.none}`} /> Not fetched</span>
        </div>
        {next ? (
          <Link href={next.href} className="btn btn-secondary btn-sm whitespace-nowrap">{next.track} R{next.raceNumber} →</Link>
        ) : (
          <span className="btn btn-secondary btn-sm opacity-40 whitespace-nowrap">none →</span>
        )}
      </div>
      <div className="mt-2 flex gap-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
        {[...meetings.entries()].map(([track, rs]) => (
          <div key={track} className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[11px] uppercase tracking-[0.06em] font-bold text-ink-soft mr-1">{track}</span>
            {rs.map((r) => (
              <Link
                key={r.raceId}
                href={r.href}
                title={`${r.name}: ${r.full} of ${r.runners} full`}
                className={`nums text-xs rounded-full border px-2 py-0.5 ${CHIP[coverage(r)]} ${r.raceId === current ? "ring-2 ring-ink" : ""}`}
              >
                {r.raceNumber}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
