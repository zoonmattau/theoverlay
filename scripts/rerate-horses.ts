// Re-rates every stored horse from the entry its row keeps, with today's
// rating code: class and the section ratings, then peak, trend and starts
// from the same runs on the same basis. A horse's row is otherwise only
// refreshed when it is on a card, so after a change to the rating the
// rankings mixed scales: on 22 Sep 2026 Jimmysstar led the ladder on a
// class of 115 written on 29 Aug, twelve points above its best run, while
// Sheza Alibi, rated after the September changes, sat seventh at 108.
// The par for a horse rated alone is its official rating where it has one,
// else the grade of its last race, since there is no race to take it from.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/rerate-horses.ts [--dry] [name ...]
import { supabaseAdmin } from "../src/lib/billing/access";
import type { RaceEntry } from "../src/lib/formking/types";
import { isJumps, parseClass, rateEntries, runPoints } from "../src/lib/model/ratings";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const names = args.filter((a) => !a.startsWith("--"));

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const round = (v: number) => Math.round(v * 10) / 10;

/** The level a horse races at, in benchmark points, for reading its runs. */
function parOf(e: RaceEntry, past: RaceEntry["pastEvents"]): number {
  const ohr = e.benchmarkRating && e.benchmarkRating > 0 ? e.benchmarkRating : undefined;
  const last = past?.[0];
  return ohr ?? parseClass(last?.raceName) ?? 64;
}

void (async () => {
  const db = supabaseAdmin();
  let from = 0, done = 0, rated = 0;
  for (;;) {
    let q = db.from("horses").select("id, name, entry, last_seen, last_track, class, peak").order("id").range(from, from + 499);
    if (names.length) q = q.in("name", names);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const r of rows) {
      const e = r.entry as RaceEntry;
      const past = (e.pastEvents ?? []).filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched && p.date && !isJumps(p)).sort((a, b) => b.date - a.date);
      const par = parOf(e, past);
      const asOf = Date.parse(`${String(r.last_seen)}T12:00:00+10:00`) || undefined;
      let g: ReturnType<typeof rateEntries>["rated"][number]["ratings"] | undefined;
      try {
        g = rateEntries([{ ...e, scratched: false }], { classPoints: par, going: "good", distance: past[0]?.distance ?? 1200, track: r.last_track ?? undefined, date: asOf }).rated[0]?.ratings;
      } catch {
        // A horse whose form cannot be rated keeps what it has.
      }
      const pts = past.map((p) => runPoints(p, par, e.horse?.age, asOf)).filter((v) => Number.isFinite(v));
      const recent = pts.slice(0, 3), before = pts.slice(3, 6);
      const set = {
        ratings: g && g.runs > 0 ? { class: g.class, early: g.early, mid: g.mid, late: g.late, pressure: g.pressure, tempo: g.tempo, going: g.going, runs: g.runs } : null,
        class: g && g.runs > 0 ? g.class : null,
        peak: pts.length ? round(Math.max(...pts)) : null,
        trend: recent.length >= 2 && before.length >= 2 ? round(mean(recent) - mean(before)) : null,
        starts: pts.length || null,
      };
      if (set.class !== null) rated++;
      if (dry || names.length) console.log(`${String(r.name).padEnd(22)} par ${par}  class ${r.class} -> ${set.class}  peak ${r.peak} -> ${set.peak}  trend ${set.trend}  starts ${set.starts}`);
      if (!dry) {
        const { error: w } = await db.from("horses").update(set).eq("id", r.id);
        if (w) console.error("[horses]", String(r.name), String(w.message).slice(0, 80));
      }
      done++;
    }
    if (done % 1000 < 500) console.log(`${done} horses, ${rated} rated`);
    from += 500;
    if (rows.length < 500) break;
  }
  console.log(`${dry ? "would update" : "updated"} ${done} horses, ${rated} with a class`);
})();
