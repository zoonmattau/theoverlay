import Link from "next/link";

import { clock } from "@/lib/data/hub";
import type { RaceFacts } from "@/lib/data/race-facts";

/**
 * What the Datahub knows about this track and trip, in one line under the
 * race header, each fact opening the page behind it.
 */
export function DatahubStrip({ f }: { f: RaceFacts }) {
  const speed = f.trackSpeed === null ? null : f.trackSpeed >= 1 ? `quick track, ${f.trackSpeed.toFixed(1)}L under typical` : f.trackSpeed <= -1 ? `slow track, ${Math.abs(f.trackSpeed).toFixed(1)}L over typical` : "runs to typical time";
  const items: { text: string; href: string; tip: string }[] = [];
  if (speed) items.push({ text: speed, href: `/data/tracks/${encodeURIComponent(f.track)}`, tip: `${f.track} against the typical time over the same distances at every other track. Click for the track's page.` });
  if (f.standard !== null) items.push({ text: `standard ${clock(f.standard)}${f.quickest !== null ? `, quickest ${clock(f.quickest)}` : ""}`, href: `/data/distances/${f.distance}`, tip: `The typical time over ${f.distance}m at ${f.track} on ${f.onGoing === "all goings" ? "all goings" : `${f.onGoing} ground`}, from ${f.runs} timed runs. Click for the distance's page.` });
  if (f.frontRunnerWinPct !== null) items.push({ text: `leader wins ${f.frontRunnerWinPct.toFixed(0)}%${f.leaderPlacedPct !== null ? `, places ${f.leaderPlacedPct.toFixed(0)}%` : ""}`, href: `/data/tracks/${encodeURIComponent(f.track)}#shape`, tip: `How often the horse that led won, and held a place, over ${f.distance}m at ${f.track}, one row a race.` });
  if (f.tempoCost !== null) items.push({ text: `hot tempo costs ${f.tempoCost.toFixed(2)}s in the last 600`, href: `/data/tracks/${encodeURIComponent(f.track)}#tempo`, tip: "Seconds added to the last 600 for each second the early part is run quicker, here over this trip." });
  if (items.length === 0) return null;
  return (
    <p className="text-xs text-ink-secondary flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Datahub</span>
      {items.map((i) => (
        <Link key={i.href + i.text} href={i.href} className="tip underline decoration-dotted underline-offset-2" data-tip={i.tip}>{i.text}</Link>
      ))}
    </p>
  );
}
