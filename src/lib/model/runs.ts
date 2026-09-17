import "server-only";

import type { PastEvent, RaceEntry } from "@/lib/formking/types";
import { supabaseAdmin } from "@/lib/billing/access";
import { personKey } from "@/lib/data/people";
import { goingBand, isJumps } from "./ratings";

/** One horse's one past run, flat, as the runs table holds it. */
export interface RunRow {
  race_id: string;
  horse_id: string;
  horse: string;
  date: string;
  track: string | null;
  state: string | null;
  distance: number | null;
  going: string | null;
  going_band: string | null;
  race_name: string | null;
  finish: number | null;
  margin: number | null;
  runners: number | null;
  weight: number | null;
  barrier: number | null;
  sp: number | null;
  bsp: number | null;
  time_ms: number | null;
  last600_ms: number | null;
  vs_bench: number | null;
  vs_bench600: number | null;
  jockey: string | null;
  trainer: string | null;
  jockey_key: string | null;
  trainer_key: string | null;
  /** feed, or horseedge for the runs imported from the earlier project. */
  source: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The runs behind one entry, races only: no trials, spells, scratchings or jumps. */
export function runRowsOf(entry: RaceEntry, horseId: string): RunRow[] {
  const name = entry.horse?.name;
  if (!name) return [];
  const out: RunRow[] = [];
  for (const p of (entry.pastEvents ?? []) as (PastEvent & Record<string, unknown>)[]) {
    if (p.race === false || p.trial || p.spell || p.scratched || !p.raceId || !p.date || isJumps(p.raceName)) continue;
    const finish = num(p.finishPosition);
    out.push({
      race_id: p.raceId,
      horse_id: horseId,
      horse: name,
      date: new Date(p.date).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }),
      track: text(p.track),
      state: text(p.state),
      distance: num(p.distance),
      going: text(p.going),
      going_band: p.going ? goingBand(p.going) : null,
      race_name: text(p.raceName),
      finish: finish && finish > 0 ? finish : null,
      margin: num(p.margin),
      runners: num(p.numRunners),
      weight: num(p.weight),
      barrier: num(p.barrier),
      sp: num(p.startingPrice),
      bsp: num(p.bsp),
      time_ms: num(p.timeInMillis),
      last600_ms: p.sectionalDistance === 600 ? num(p.sectionalTimeInMillis) : null,
      vs_bench: p.benchmark ? num(p.benchmark.vsClass) : null,
      vs_bench600: p.benchmark?.sections?.["6-F"] ? num(p.benchmark.sections["6-F"].vsClass) : null,
      jockey: text(p.jockey),
      trainer: text(p.trainer),
      jockey_key: personKey(text(p.jockey)),
      trainer_key: personKey(text(p.trainer)),
      source: "feed",
    });
  }
  return out;
}

/** Adds runs the table does not have; a run already there is left as it was. */
export async function rememberRuns(rows: RunRow[]): Promise<void> {
  // The same race reaches us from every horse in it that we see; one row per horse per race.
  const seen = new Set<string>();
  const unique = rows.filter((r) => { const k = `${r.race_id}:${r.horse_id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  for (let i = 0; i < unique.length; i += 500) {
    const { error } = await supabaseAdmin().from("runs").upsert(unique.slice(i, i + 500), { onConflict: "race_id,horse_id", ignoreDuplicates: true });
    if (error) console.error("[runs]", error.message);
  }
}
