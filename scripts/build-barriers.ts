// Builds the barrier table from the Datahub's runs: for each track and trip
// band, how horses drawn inside, middle and wide have run against the rest
// of their field, in lengths, over every run we hold. A gate is drawn at
// random, so the mean race-centred margin by gate position is the gate's
// own effect, free of the horse. Cells are shrunk toward the trip band's
// figure across all tracks by K runs. Writes src/lib/model/barriers.json.
// npx tsx --conditions=react-server --env-file=.env.local --tsconfig tsconfig.json scripts/build-barriers.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { supabaseAdmin } from "../src/lib/billing/access";
import { trackKey } from "../src/lib/data/people";
import { BANDS, bandOf, positionOf } from "../src/lib/model/barriers";

const CACHE = process.env.OVERLAY_RUNS_CACHE ?? "C:/Users/matth/AppData/Local/Temp/claude/M--projects-overlay/40735b6b-f525-42b9-aa93-3872054b7929/scratchpad/runs-full.json";
const K = Number(process.env.OVERLAY_BARRIER_K ?? 150);
/** Only runs before this day, so a test on the clean cache never sees its own races. */
const BEFORE = process.env.OVERLAY_BARRIER_BEFORE ?? "2026-09-11";
interface Run { race_id: string; track: string | null; distance: number | null; finish: number | null; margin: number | null; runners: number | null; barrier: number | null; date: string }

async function loadRuns(): Promise<Run[]> {
  if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, "utf8"));
  const db = supabaseAdmin(); const out: Run[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("runs").select("race_id,track,distance,finish,margin,runners,barrier,date").order("date").order("race_id").order("horse_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Run[])); if (!data || data.length < 1000) break;
  }
  return out;
}

(async () => {
  const all = (await loadRuns()).filter((r) => r.date < BEFORE && r.track && r.distance && r.barrier && r.margin !== null && r.finish && r.finish > 0);
  const byRace = new Map<string, Run[]>();
  for (const r of all) byRace.set(r.race_id, [...(byRace.get(r.race_id) ?? []), r]);
  // Race-centred margin: lengths beaten less the field's mean, clipped so a tailed-off horse does not set the cell.
  const cells = new Map<string, { n: number; sum: number }>();
  const bands = new Map<string, { n: number; sum: number }>();
  let used = 0;
  for (const rs of byRace.values()) {
    if (rs.length < 6) continue;
    const field = rs.length;
    const margins = rs.map((r) => Math.min(20, Number(r.margin)));
    const mm = margins.reduce((a, b) => a + b, 0) / field;
    for (const [i, r] of rs.entries()) {
      const centred = margins[i] - mm;
      const band = bandOf(r.distance!);
      const pos = positionOf(r.barrier!, field);
      const key = `${trackKey(r.track!)}|${band}|${pos}`;
      const c = cells.get(key) ?? { n: 0, sum: 0 }; c.n++; c.sum += centred; cells.set(key, c);
      const b = bands.get(`${band}|${pos}`) ?? { n: 0, sum: 0 }; b.n++; b.sum += centred; bands.set(`${band}|${pos}`, b);
      used++;
    }
  }
  // Effect in lengths: positive is good for the horse (beaten less than the field), so the sign flips.
  const bandEffect: Record<string, number> = {};
  for (const [k, b] of bands) bandEffect[k] = -b.sum / b.n;
  const table: Record<string, { effect: number; runs: number }> = {};
  for (const [k, c] of cells) {
    const [, band, pos] = k.split("|");
    const prior = bandEffect[`${band}|${pos}`] ?? 0;
    table[k] = { effect: Math.round(((-c.sum + prior * K) / (c.n + K)) * 100) / 100, runs: c.n };
  }
  writeFileSync("src/lib/model/barriers.json", JSON.stringify({ built: new Date().toISOString().slice(0, 10), before: BEFORE, k: K, runs: used, bands: BANDS, band: bandEffect, cells: table }, null, 1));
  console.log(`${used} runs in ${byRace.size} races -> ${Object.keys(table).length} track/trip/position cells`);
  console.log("trip band x position, lengths against the field (inside / middle / wide):");
  for (let band = 0; band < BANDS.length; band++) console.log(`  under ${BANDS[band]}m: ${[0, 1, 2].map((p) => `${(bandEffect[`${band}|${p}`] ?? 0).toFixed(2)} (${bands.get(`${band}|${p}`)?.n ?? 0})`).join("  ")}`);
  const wide = Object.entries(table).filter(([k]) => k.endsWith("|2")).sort((a, b) => a[1].effect - b[1].effect);
  console.log("tracks where a wide gate costs most (sprint band):", wide.filter(([k]) => k.includes("|0|")).slice(0, 8).map(([k, v]) => `${k.split("|")[0]} ${v.effect} (${v.runs})`).join(", "));
  console.log("tracks where a wide gate costs least (sprint band):", wide.filter(([k]) => k.includes("|0|")).slice(-6).map(([k, v]) => `${k.split("|")[0]} ${v.effect} (${v.runs})`).join(", "));
})();
