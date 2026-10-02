// Writes each meeting's race speeds by distance band to src/lib/model/day-variants.json, which
// the model reads a run's clock against when OVERLAY_DAY_VARIANT is on (see variants.ts). A race's
// speed is the median over its runners of lengths against the class benchmark plus the margin
// they were beaten (capped at 8), so it reads the race's own time with less noise than the winner alone.
// npx tsx --conditions=react-server --env-file=.env.local scripts/export-day-variants.ts
import { writeFileSync } from "node:fs";
import { supabaseAdmin } from "../src/lib/billing/access";
import { distanceBand } from "../src/lib/model/variants";

(async () => {
  const db = supabaseAdmin();
  const rows: { race_id: string; track: string; date: string; distance: number; vs_bench: number; margin: number | null; finish: number | null }[] = [];
  // A month at a time: one query over the whole table times out.
  for (let m = new Date("2025-01-01"); m < new Date(); m.setUTCMonth(m.getUTCMonth() + 1)) {
    const from = m.toISOString().slice(0, 10);
    const next = new Date(m);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const to = next.toISOString().slice(0, 10);
    for (let f = 0; ; f += 1000) {
      const { data, error } = await db.from("runs").select("race_id,track,date,distance,vs_bench,margin,finish").not("vs_bench", "is", null).gte("date", from).lt("date", to).order("race_id").order("horse_id").range(f, f + 999);
      if (error) throw new Error(`${from}: ${error.message}`);
      rows.push(...(data as typeof rows));
      if (!data || data.length < 1000) break;
    }
  }
  const byRace = new Map<string, { key: string; reads: number[] }>();
  for (const r of rows) {
    if (!r.track || !r.date || !r.distance || !(r.finish && r.finish > 0)) continue;
    const key = `${r.track.toLowerCase()}|${r.date}|${distanceBand(r.distance)}`;
    const race = byRace.get(r.race_id) ?? { key, reads: [] };
    race.reads.push(r.vs_bench + Math.min(8, r.finish === 1 ? 0 : (r.margin ?? 8)));
    byRace.set(r.race_id, race);
  }
  const out: Record<string, Record<string, number>> = {};
  for (const [raceId, { key, reads }] of byRace) {
    const s = [...reads].sort((a, b) => a - b);
    const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    (out[key] ??= {})[raceId] = Math.round(mid * 10) / 10;
  }
  writeFileSync("src/lib/model/day-variants.json", JSON.stringify(out));
  console.log(`${byRace.size} races in ${Object.keys(out).length} meeting bands from ${rows.length} runs`);
})();
