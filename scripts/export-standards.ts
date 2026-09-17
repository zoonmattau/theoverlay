// Writes the Datahub's standard times (track, distance, going: the typical
// time from the runs table) to src/lib/model/standards.json, which the model
// reads a run's clock against. Re-run as the runs table grows.
// npx tsx --conditions=react-server --env-file=.env.local scripts/export-standards.ts
import { writeFileSync } from "node:fs";
import { supabaseAdmin } from "../src/lib/billing/access";
(async () => {
  const db = supabaseAdmin();
  const all: Record<string, unknown>[] = [];
  for (let f = 0; ; f += 1000) { const { data } = await db.rpc("hub_track_distances").range(f, f + 999); if (!data?.length) break; all.push(...(data as Record<string, unknown>[])); if (data.length < 1000) break; }
  const out: Record<string, { all: number; runs: number; good?: number; soft?: number; heavy?: number }> = {};
  for (const r of all) {
    if (Number(r.runs) < 20) continue;
    out[`${String(r.track).toLowerCase()}|${r.distance}`] = {
      all: Math.round(Number(r.median_ms)), runs: Number(r.runs),
      good: r.good_ms === null ? undefined : Math.round(Number(r.good_ms)),
      soft: r.soft_ms === null ? undefined : Math.round(Number(r.soft_ms)),
      heavy: r.heavy_ms === null ? undefined : Math.round(Number(r.heavy_ms)),
    };
  }
  writeFileSync("src/lib/model/standards.json", JSON.stringify(out));
  console.log(`${Object.keys(out).length} track and distance standards written`);
})();
