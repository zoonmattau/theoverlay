// Fills peak, trend and starts on horses already stored, from the entry each
// row keeps. The card build writes them from now on; this is for the ones
// remembered before the columns existed.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-horse-form.ts [limit]
import { supabaseAdmin } from "../src/lib/billing/access";
import { isJumps, runPoints } from "../src/lib/model/ratings";
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
      .select("id, entry, last_seen, class")
      .order("id")
      .range(from, from + 499);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    const patch: { id: string; peak: number | null; trend: number | null; starts: number | null }[] = [];
    for (const r of rows) {
      const e = r.entry as RaceEntry;
      // runPoints reads a run against the level the horse races at. The build
      // has today's race for that; here the horse's own class rating is the
      // honest stand-in, and a par of 90 for everyone dragged a Group horse's
      // best run below its rating.
      const par = r.class === null ? 90 : Number(r.class);
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

    // An upsert would be an insert that happens to conflict, and the row has
    // columns it cannot supply, so each horse is updated on its id. Five at a
    // time with a breath between: twenty in flight had the instance handing
    // back 525s, and there is no hurry on a one-off.
    const write = async (id: string, set: Record<string, number | null>, go = 0): Promise<void> => {
      const { error: e } = await db.from("horses").update(set).eq("id", id);
      if (!e) return;
      if (go >= 3) return void console.error("[horses]", String(e.message).slice(0, 80));
      await new Promise((r) => setTimeout(r, 400 * (go + 1)));
      return write(id, set, go + 1);
    };
    for (let i = 0; i < patch.length; i += 5) {
      await Promise.all(patch.slice(i, i + 5).map(({ id, ...set }) => write(id, set)));
      await new Promise((r) => setTimeout(r, 30));
    }
    done += rows.length;
    process.stdout.write(`\r${done} horses`);
    from += 500;
    if (done >= limit) break;
  }
  console.log(`\n${done} horses, ${withTrend} with a trend (two runs each side)`);
})();
