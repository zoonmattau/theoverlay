// Brings HorseEdge (M:\projects\dead\horse\horse.db, the user's earlier
// project) into the Datahub: every finished run to April 2026 into the runs
// table, and its sectional benchmarks into the bench_* tables. Also keys the
// feed's rows already there. Runs that the feed already holds (same day,
// same horse) are left to the feed.
// npx tsx --conditions=react-server --env-file=.env.local scripts/import-horseedge.ts [--benchmarks-only]
import { DatabaseSync } from "node:sqlite";
import { supabaseAdmin } from "../src/lib/billing/access";
import { personKey, trackKey } from "../src/lib/data/people";
import { goingBand } from "../src/lib/model/ratings";
import type { RunRow } from "../src/lib/model/runs";

const DB = process.env.HORSEEDGE_DB ?? "M:/projects/dead/horse/horse.db";
const SECONDS_PER_LENGTH = 0.167;
const db = supabaseAdmin();
const he = new DatabaseSync(DB, { readOnly: true });

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const longer = (a: string | null, b: string | null) => (a && b ? (a.length >= b.length ? a : b) : a ?? b);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** "5.45L", "nose", "hd", "1/2 hd" and the like to lengths. */
function margin(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (/^(dh|dead)/.test(s)) return 0;
  if (/nose|ns/.test(s)) return 0.05;
  if (/sh|short/.test(s)) return 0.1;
  if (/^hd|head/.test(s)) return 0.2;
  if (/nk|neck/.test(s)) return 0.3;
  const m = s.match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}

async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string, ignore = false) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict, ignoreDuplicates: ignore });
    if (error) { console.error(`\n[${table}]`, error.message); throw error; }
  }
}

/** The feed's rows get their keys; their (date, horse) pairs come back so HorseEdge does not repeat them. */
async function keyFeedRows(): Promise<Set<string>> {
  const seen = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await db.from("runs").select("race_id, horse_id, horse, date, jockey, trainer, jockey_key").eq("source", "feed").order("race_id").order("horse_id").range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) seen.add(`${r.date}:${String(r.horse).toLowerCase()}`);
    const unkeyed = data.filter((r) => r.jockey_key === null && (r.jockey || r.trainer));
    if (unkeyed.length) await upsert("runs", unkeyed.map((r) => ({ race_id: r.race_id, horse_id: r.horse_id, horse: r.horse, date: r.date, jockey_key: personKey(r.jockey), trainer_key: personKey(r.trainer), source: "feed" })), "race_id,horse_id");
    from += 1000;
    process.stdout.write(`\rfeed rows keyed: ${from}`);
    if (data.length < 1000) break;
  }
  console.log(`\n${seen.size} feed runs`);
  return seen;
}

async function importRuns(feedSeen: Set<string>) {
  const rows = he.prepare(`
    select r.id, r.race_id, r.horse_name, r.finish_position, r.last_600m, r.sp, r.jockey, r.trainer, r.weight_kg,
      ri.barrier, ri.weight_kg as ri_weight, ri.jockey as ri_jockey, ri.trainer as ri_trainer, ri.starting_price, ri.margin, ri.finishing_position,
      ra.race_number, ra.race_name, ra.win_time_seconds, ra.distance, ra.track_rating, ra.race_date, ra.starters,
      m.venue, m.state, m.date as mdate
    from runners r
    join races ra on ra.id = r.race_id
    join meetings m on m.meeting_id = ra.meeting_id
    left join runner_info ri on ri.runner_id = r.id
    where coalesce(r.is_scratched, 0) = 0 and coalesce(r.finish_position, ri.finishing_position, 0) > 0 and r.horse_name is not null
  `).all() as Record<string, unknown>[];
  console.log(`${rows.length} HorseEdge runs`);
  const out: RunRow[] = [];
  let skipped = 0;
  const seenKey = new Set<string>();
  for (const r of rows) {
    const date = text(r.race_date) || text(r.mdate);
    const horse = text(r.horse_name);
    if (!date || !horse || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (feedSeen.has(`${date}:${horse.toLowerCase()}`)) { skipped++; continue; }
    const race_id = `he:${r.race_id}`;
    const horse_id = `he:${slug(horse)}`;
    const k = `${race_id}:${horse_id}`;
    if (seenKey.has(k)) continue;
    seenKey.add(k);
    const finish = num(r.finish_position) ?? num(r.finishing_position);
    const beaten = finish === 1 ? 0 : margin(r.margin);
    const winTime = num(r.win_time_seconds);
    const jockey = longer(text(r.ri_jockey), text(r.jockey));
    const trainer = longer(text(r.ri_trainer), text(r.trainer));
    const going = text(r.track_rating);
    out.push({
      race_id, horse_id, horse, date,
      track: trackKey(text(r.venue)), state: text(r.state), distance: num(r.distance), going, going_band: going ? goingBand(going) : null,
      race_name: text(r.race_name), finish, margin: beaten, runners: num(r.starters),
      weight: num(r.ri_weight) ?? num(r.weight_kg), barrier: num(r.barrier),
      sp: num(r.sp) ?? num(r.starting_price), bsp: null,
      time_ms: winTime && beaten !== null ? Math.round((winTime + beaten * SECONDS_PER_LENGTH) * 1000) : null,
      last600_ms: num(r.last_600m) ? Math.round(num(r.last_600m)! * 1000) : null,
      vs_bench: null, vs_bench600: null,
      jockey, trainer, jockey_key: personKey(jockey), trainer_key: personKey(trainer), source: "horseedge",
    });
  }
  console.log(`${out.length} to write, ${skipped} already held by the feed`);
  for (let i = 0; i < out.length; i += 5000) {
    await upsert("runs", out.slice(i, i + 5000) as unknown as Record<string, unknown>[], "race_id,horse_id");
    process.stdout.write(`\rwritten ${Math.min(i + 5000, out.length)}`);
  }
  console.log();
}

async function importBenchmarks() {
  const speed = (he.prepare("select track, speed_index, is_metro, sample_count from track_speed_index").all() as Record<string, unknown>[])
    .map((r) => ({ track: trackKey(text(r.track)), speed_index: num(r.speed_index), metro: Boolean(r.is_metro), sample: num(r.sample_count) ?? 0 }))
    .filter((r) => r.track && r.speed_index !== null);
  await upsert("bench_track_speed", dedupe(speed, (r) => r.track!), "track");
  const l600 = (he.prepare("select track, distance, mean_l600, stddev_l600, sample_count from l600_benchmarks").all() as Record<string, unknown>[])
    .map((r) => ({ track: trackKey(text(r.track)), distance: num(r.distance), mean_l600: num(r.mean_l600), sd_l600: num(r.stddev_l600), sample: num(r.sample_count) ?? 0 }))
    .filter((r) => r.track && r.distance && r.mean_l600 !== null);
  await upsert("bench_l600", dedupe(l600, (r) => `${r.track}:${r.distance}`), "track,distance");
  const phase = (he.prepare("select track, distance, phase, median_time, mean_time, stddev_time, p10, p25, p75, p90, sample_count from phase_benchmarks").all() as Record<string, unknown>[])
    .map((r) => ({ track: trackKey(text(r.track)), distance: num(r.distance), phase: text(r.phase), median_s: num(r.median_time), mean_s: num(r.mean_time), sd_s: num(r.stddev_time), p10: num(r.p10), p25: num(r.p25), p75: num(r.p75), p90: num(r.p90), sample: num(r.sample_count) ?? 0 }))
    .filter((r) => r.track && r.distance && r.phase && r.median_s !== null);
  await upsert("bench_phase", dedupe(phase, (r) => `${r.track}:${r.distance}:${r.phase}`), "track,distance,phase");
  const tempo = (he.prepare("select track, distance_band, condition_group, early_time_mean, early_time_stddev, middle_time_mean, middle_time_stddev, finish_600_mean, finish_600_stddev, tempo_finish_coefficient, sample_count from track_tempo_benchmarks").all() as Record<string, unknown>[])
    .map((r) => ({ track: trackKey(text(r.track)), distance_band: text(r.distance_band), condition: text(r.condition_group), early_mean: num(r.early_time_mean), early_sd: num(r.early_time_stddev), middle_mean: num(r.middle_time_mean), middle_sd: num(r.middle_time_stddev), finish600_mean: num(r.finish_600_mean), finish600_sd: num(r.finish_600_stddev), tempo_finish_coefficient: num(r.tempo_finish_coefficient), sample: num(r.sample_count) ?? 0 }))
    .filter((r) => r.track && r.distance_band && r.condition);
  await upsert("bench_track_tempo", dedupe(tempo, (r) => `${r.track}:${r.distance_band}:${r.condition}`), "track,distance_band,condition");
  const profile = (he.prepare("select track, distance, avg_early_pct, avg_mid_pct, avg_finish_pct, front_runner_win_pct, closer_win_pct, sample_count from track_tempo_profiles").all() as Record<string, unknown>[])
    .map((r) => ({ track: trackKey(text(r.track)), distance: num(r.distance), early_pct: num(r.avg_early_pct), mid_pct: num(r.avg_mid_pct), finish_pct: num(r.avg_finish_pct), front_runner_win_pct: num(r.front_runner_win_pct), closer_win_pct: num(r.closer_win_pct), sample: num(r.sample_count) ?? 0 }))
    .filter((r) => r.track && r.distance);
  await upsert("bench_track_profile", dedupe(profile, (r) => `${r.track}:${r.distance}`), "track,distance");
  console.log(`benchmarks: ${speed.length} track speeds, ${l600.length} L600, ${phase.length} phases, ${tempo.length} tempo bands, ${profile.length} track profiles`);
}

/** Two sponsored spellings of one track fold to one row: the one with the bigger sample stays. */
function dedupe<T extends { sample: number }>(rows: T[], key: (r: T) => string): T[] {
  const by = new Map<string, T>();
  for (const r of rows) { const k = key(r); const had = by.get(k); if (!had || r.sample > had.sample) by.set(k, r); }
  return [...by.values()];
}

(async () => {
  if (!process.argv.includes("--benchmarks-only")) {
    const feedSeen = await keyFeedRows();
    await importRuns(feedSeen);
  }
  await importBenchmarks();
  const { count } = await db.from("runs").select("race_id", { count: "exact", head: true });
  console.log(`runs table: ${count} rows`);
})();
