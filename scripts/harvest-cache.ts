// Folds a day's raw feed rows (fk_cache on Supabase: each race's form, and
// the meeting summary with the results and the last prices) into the local
// backtest cache, so the day can be re-rated with a changed model without
// buying it again. Run for the days since the last harvest; a race already
// in the cache with a result is left alone.
// npx tsx --conditions=react-server --env-file=.env.local scripts/harvest-cache.ts 2026-09-18 2026-09-19
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../src/lib/billing/access";
import type { MeetingSummary, RaceEntry, RaceSummary } from "../src/lib/formking/types";
import { readStoredCard } from "../src/lib/model/store";

const DIR = ".formking-cache";
const file = (kind: string, key: string) => path.join(DIR, `${kind}-${createHash("sha1").update(key).digest("hex")}.json`);
const ddmmyy = (date: string) => `${date.slice(8, 10)}${date.slice(5, 7)}${date.slice(2, 4)}`;

/** The race form brought up to date from the meeting summary: prices, scratchings and results move, the form does not. */
function merge(form: RaceSummary, live?: RaceSummary): RaceSummary {
  if (!live) return form;
  const fresh = new Map(live.entries.map((e) => [e.number, e]));
  const entries: RaceEntry[] = form.entries.map((e) => {
    const l = fresh.get(e.number);
    return l ? { ...e, odds: l.odds ?? e.odds, horseResult: l.horseResult ?? e.horseResult, scratched: l.scratched ?? e.scratched, jockey: l.jockey ?? e.jockey, weight: l.weight ?? e.weight } : e;
  });
  return { ...form, ...live, entries, status: live.status ?? form.status };
}

(async () => {
  const db = supabaseAdmin();
  mkdirSync(DIR, { recursive: true });
  for (const date of process.argv.slice(2)) {
    const { data: rows } = await db.from("fk_cache").select("key, data").eq("kind", "race").like("key", `%_${ddmmyy(date)}_%`);
    const { data: meetings } = await db.from("fk_cache").select("key, data").eq("kind", "meeting").like("key", `%-${date.replace(/-/g, "")}`);
    const liveRaces = new Map<string, RaceSummary>();
    for (const m of (meetings ?? []) as { data: MeetingSummary }[]) for (const r of m.data.races ?? []) liveRaces.set(r.raceId, r);
    // The card's prices are the last seen before the jump; the summary's may be quotes left up after it.
    const frozen = new Map<string, { best: number; avg?: number }>();
    const stored = await readStoredCard(date);
    for (const m of stored?.card.meetings ?? []) for (const r of m.races) for (const x of r.runners) if (x.marketPrice) frozen.set(`${r.raceId}:${x.tabNumber}`, { best: x.marketPrice, avg: x.marketAvg });
    let written = 0, kept = 0, unresulted = 0;
    for (const row of (rows ?? []) as { key: string; data: RaceSummary }[]) {
      const key = row.key.slice("race:".length);
      const out = file("race", key);
      if (existsSync(out)) {
        const had = JSON.parse(readFileSync(out, "utf8")).data as RaceSummary;
        if (had.entries.some((e) => e.horseResult)) { kept++; continue; }
      }
      const merged = merge(row.data, liveRaces.get(row.data.raceId));
      for (const e of merged.entries) {
        const f = frozen.get(`${merged.raceId}:${e.number}`);
        if (f && e.odds) e.odds = { ...e.odds, bestNow: f.best, avgNow: f.avg ?? e.odds.avgNow };
      }
      if (!merged.entries.some((e) => e.horseResult)) { unresulted++; continue; }
      writeFileSync(out, JSON.stringify({ at: Date.now(), data: merged }));
      written++;
    }
    console.log(`${date}: ${written} races harvested, ${kept} already held, ${unresulted} without a result yet`);
  }
})();
