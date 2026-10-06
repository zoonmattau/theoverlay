import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import { goingLabel } from "@/lib/model/ratings";

/** One past run of a horse, as the runs table holds it. Read from Supabase only, never Form King. */
export interface HorseRun {
  raceId: string;
  date: string;
  track: string | null;
  state: string | null;
  distance: number | null;
  going: string | null;
  raceName: string | null;
  finish: number | null;
  runners: number | null;
  margin: number | null;
  weight: number | null;
  barrier: number | null;
  sp: number | null;
  bsp: number | null;
  /** Last 600 in seconds. */
  last600: number | null;
  /** Lengths against the class benchmark, when the feed timed it. */
  vsBench: number | null;
  jockey: string | null;
  jockeyKey: string | null;
  trainer: string | null;
  trainerKey: string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const txt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

/** Every run we hold for a horse, newest first, matched on its name as both sources write it. */
export async function horseRuns(name: string): Promise<HorseRun[]> {
  const { data } = await supabaseAdmin()
    .from("runs")
    .select("race_id, date, track, state, distance, going, race_name, finish, runners, margin, weight, barrier, sp, bsp, last600_ms, vs_bench, jockey, jockey_key, trainer, trainer_key")
    .ilike("horse", name.replace(/[%_]/g, "\\$&"))
    .order("date", { ascending: false })
    .limit(300);
  // One run can sit in the table from both sources; the first of a date and track stands.
  const seen = new Set<string>();
  const out: HorseRun[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const k = `${r.date}|${String(r.track ?? "").toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      raceId: String(r.race_id), date: String(r.date), track: txt(r.track), state: txt(r.state), distance: num(r.distance), going: goingLabel(txt(r.going) ?? undefined) ?? null,
      raceName: txt(r.race_name), finish: num(r.finish), runners: num(r.runners), margin: num(r.margin), weight: num(r.weight), barrier: num(r.barrier),
      sp: num(r.sp), bsp: num(r.bsp), last600: r.last600_ms ? Math.round(Number(r.last600_ms) / 10) / 100 : null, vsBench: num(r.vs_bench),
      jockey: txt(r.jockey), jockeyKey: txt(r.jockey_key), trainer: txt(r.trainer), trainerKey: txt(r.trainer_key),
    });
  }
  return out;
}
