// Fills peak, trend and starts on horses already stored, from the entry each
// row keeps. The card build writes them from now on; this is for the ones
// remembered before the columns existed.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-horse-form.ts [limit]
import { supabaseAdmin } from "../src/lib/billing/access";
import { classPoints, isJumps, runPoints } from "../src/lib/model/ratings";
import type { RaceEntry } from "../src/lib/formking/types";

void (async () => {
  const limit = Number(process.argv[2]) || 20000;
  const db = supabaseAdmin();
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const round = (v: number) => Math.round(v * 10) / 10;

  let from = 0;
  let done = 0;
  let withTrend = 0;
  for (;;) {
    const { data, error } = await db
      .from("horses")
      .select("id, entry, last_seen")
      .order("id")
      .range(from, from + 499);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    const patch: { id: string; peak: number | null; trend: number | null; starts: number | null }[] = [];
    for (const r of rows) {
      const e = r.entry as RaceEntry;
      // The race the horse was remembered from set the par its runs were read against.
      const par = classPoints(undefined, (e as RaceEntry & { raceName?: string }).raceName) ?? 90;
      const past = (e.pastEvents ?? []).filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched && p.date && !isJumps(p));
      const asOf = Date.parse(`${String(r.last_seen)}T12:00:00+10:00`) || undefined;
      const pts = past.map((p) => runPoints(p, par, e.horse?.age, asOf)).filter((v) => Number.isFinite(v));
      if (pts.length === 0) {
        patch.push({ id: String(r.id), peak: null, trend: null, starts: null });
        continue;
      }
      const recent = pts.slice(0, 3);
      const before = pts.slice(3, 6);
      const trend = recent.length >= 2 && before.length >= 2 ? round(mean(recent) - mean(before)) : null;
      if (trend !== null) withTrend++;
      patch.push({ id: String(r.id), peak: round(Math.max(...pts)), trend, starts: pts.length });
    }

    for (let i = 0; i < patch.length; i += 100) {
      const { error: up } = await db.from("horses").upsert(patch.slice(i, i + 100), { onConflict: "id" });
      if (up) console.error("[horses]", up.message);
    }
    done += rows.length;
    process.stdout.write(`\r${done} horses`);
    from += 500;
    if (done >= limit) break;
  }
  console.log(`\n${done} horses, ${withTrend} with a trend (two runs each side)`);
})();
