import "server-only";
import { cacheLife } from "next/cache";

import { supabaseAdmin } from "@/lib/billing/access";
import { DISTANCE_BANDS, PERIODS, type HubFilter } from "./filters";
import { personKey } from "./people";
import { readSnapshot, writeSnapshot } from "./snapshot";
export type { HubFilter } from "./filters";
export { PERIODS } from "./filters";

const since = (period?: string) => {
  const p = PERIODS.find((x) => x.key === period);
  return p?.days ? new Date(Date.now() - p.days * 86400_000).toISOString().slice(0, 10) : null;
};

/**
 * The Datahub: jockeys, trainers, tracks, distances and goings, ranked from
 * every past run on the form of every horse we have rated (the runs table).
 * Nothing here is a licensed figure: the times, places and prices are the
 * public record, and the feed's benchmark appears only as an average read
 * of a track.
 */

/** A length is about a sixth of a second. */
const SECONDS_PER_LENGTH = 0.167;
/** Timed runs a track and distance needs before its time says anything about the track. */
const MIN_RUNS = 20;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export interface Person {
  name: string;
  /** First initial and surname, the profile's address. */
  key: string;
  rides: number;
  wins: number;
  places: number;
  /** Winners the market expected from the rides that carried a price, and how many rides and wins those were. */
  expected: number;
  priced: number;
  winsPriced: number;
  /** Wins over the market's expectation, per hundred priced rides, shrunk toward nought on a short record. */
  power: number;
  winPct: number;
  placePct: number;
  rides30: number;
  wins30: number;
  lastRide: string;
  firstRide: string;
  /** Average starting price of the winners. */
  winSp: number | null;
}

/** Rides the record needs before its edge is taken at face value. */
const SHRINK_RIDES = 50;

/** Every row of a function's result, a thousand at a time, which is the server's cap on one request. */
async function rpcAll(fn: string, args: Record<string, unknown> = {}, max = 50_000): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await supabaseAdmin().rpc(fn, args).range(from, from + 999);
    if (error) { console.error(`[hub] ${fn}`, error.message); break; }
    if (!data?.length) break;
    out.push(...(data as Record<string, unknown>[]));
    if (data.length < 1000) break;
  }
  return out;
}

/** A name for the page: the claim a HorseEdge apprentice carried, "(a1.5)", comes off. */
const displayName = (name: string) => name.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();

const rpcFilter = (f: HubFilter) => {
  const band = DISTANCE_BANDS.find((b) => b.key === f.band);
  return {
    p_states: f.states?.length ? f.states : null,
    p_tracks: f.tracks?.length ? f.tracks : null,
    p_since: since(f.period),
    p_goings: f.goings?.length ? f.goings : null,
    p_distances: f.distances?.length ? f.distances : null,
    p_dist_lo: band ? band.lo : null,
    p_dist_hi: band ? band.hi : null,
  };
};

/**
 * The market's chance, calibrated: Betfair SP and bookmaker SP each scaled
 * so that over every run we hold the expected winners equal the actual
 * ones. Winners beat the Betfair figure by about a tenth and fall short of
 * the bookmakers' by about a twentieth; without this the whole ranking sat
 * under nought. Set from the whole population, whatever the filter, so a
 * state or a track can still read above or below the market.
 */
interface Calibration { bsp: number; sp: number }
const rawSums = (rows: Record<string, unknown>[]) => {
  const t = { wb: 0, eb: 0, ws: 0, es: 0 };
  for (const r of rows) { t.wb += Number(r.wins_bsp); t.eb += Number(r.expected_bsp); t.ws += Number(r.wins_sp); t.es += Number(r.expected_sp); }
  return t;
};
async function calibration(): Promise<Calibration> {
  const snap = await readSnapshot<Calibration>("calibration");
  if (snap) return snap;
  return calibrationLive();
}
async function calibrationLive(): Promise<Calibration> {
  const t = rawSums(await rpcAll("hub_people", { p_kind: "jockey" }));
  return { bsp: t.eb > 0 ? t.wb / t.eb : 1, sp: t.es > 0 ? t.ws / t.es : 1 };
}
/** Priced rides, their winners and the calibrated expectation from a row's two price columns. */
const priced = (r: Record<string, unknown>, c: Calibration) => ({
  priced: Number(r.priced_bsp) + Number(r.priced_sp),
  winsPriced: Number(r.wins_bsp) + Number(r.wins_sp),
  expected: Math.round((Number(r.expected_bsp) * c.bsp + Number(r.expected_sp) * c.sp) * 10) / 10,
});

/** Power: winners over the market's expectation per hundred priced rides, shrunk toward nought on a short record. */
const powerOf = (winsPriced: number, expected: number, priced: number) => Math.round(((winsPriced - expected) / (priced + SHRINK_RIDES)) * 100 * 10) / 10;

const person = (r: Record<string, unknown>, c: Calibration): Person => {
  const rides = Number(r.rides), wins = Number(r.wins);
  const { priced: n, winsPriced, expected } = priced(r, c);
  const name = displayName(String(r.name));
  return {
    name,
    key: personKey(name) ?? name,
    rides, wins, expected, priced: n, winsPriced,
    places: Number(r.places),
    power: powerOf(winsPriced, expected, n),
    winPct: Math.round((100 * wins) / Math.max(1, rides) * 10) / 10,
    placePct: Math.round((100 * Number(r.places)) / Math.max(1, rides) * 10) / 10,
    rides30: Number(r.rides_30),
    wins30: Number(r.wins_30),
    lastRide: String(r.last_ride),
    firstRide: String(r.first_ride),
    winSp: r.win_sp === null ? null : Number(r.win_sp),
  };
};

/** Jockeys or trainers, ranked on Power, cut by the filter. */
export async function hubPeople(kind: "jockey" | "trainer", filter: HubFilter = {}): Promise<Person[]> {
  "use cache";
  cacheLife("hours");
  if (!Object.values(filter).some((v) => (Array.isArray(v) ? v.length : v))) {
    const snap = await readSnapshot<Person[]>(`people:${kind}`);
    if (snap) return snap;
  }
  return peopleLive(kind, filter);
}

async function peopleLive(kind: "jockey" | "trainer", filter: HubFilter): Promise<Person[]> {
  const [rows, c] = await Promise.all([rpcAll("hub_people", { p_kind: kind, ...rpcFilter(filter) }), calibration()]);
  return rows.map((r) => person(r, c)).sort((a, b) => b.power - a.power || b.wins - a.wins);
}

/** Written by the card cron: the all-time rankings and the standard times, the answers a race page needs. */
export async function writeHubSnapshots(): Promise<void> {
  await writeSnapshot("calibration", await calibrationLive());
  const [jockeys, trainers, tracks] = await Promise.all([peopleLive("jockey", {}), peopleLive("trainer", {}), trackDistancesRaw()]);
  await Promise.all([writeSnapshot("people:jockey", jockeys), writeSnapshot("people:trainer", trainers), writeSnapshot("track-distances", tracks)]);
}

export interface Combo {
  jockey: string;
  trainer: string;
  jockeyKey: string;
  trainerKey: string;
  rides: number;
  wins: number;
  places: number;
  expected: number;
  priced: number;
  winsPriced: number;
  power: number;
  winPct: number;
  lastRide: string;
}

/** Jockey and trainer pairs with five runs or more together. */
export async function hubCombos(filter: HubFilter = {}): Promise<Combo[]> {
  "use cache";
  cacheLife("hours");
  const [rows, c] = await Promise.all([rpcAll("hub_combos", rpcFilter(filter)), calibration()]);
  return rows
    .map((r) => {
      const rides = Number(r.rides), wins = Number(r.wins);
      const { priced: n, winsPriced, expected } = priced(r, c);
      const jockey = displayName(String(r.jockey)), trainer = displayName(String(r.trainer));
      return {
        jockey, trainer, jockeyKey: personKey(jockey) ?? "", trainerKey: personKey(trainer) ?? "",
        rides, wins, expected, priced: n, winsPriced, places: Number(r.places),
        power: powerOf(winsPriced, expected, n),
        winPct: Math.round((100 * wins) / Math.max(1, rides) * 10) / 10,
        lastRide: String(r.last_ride),
      };
    })
    .sort((a, b) => b.power - a.power || b.wins - a.wins);
}

/** The tracks the runs cover, most run first, for the filter menu. */
export async function hubTracksList(): Promise<{ track: string; state: string | null; runs: number }[]> {
  "use cache";
  cacheLife("hours");
  const rows = await rpcAll("hub_tracks_list");
  return rows.map((r) => ({ track: String(r.track), state: (r.state as string | null) ?? null, runs: Number(r.runs) }));
}

export interface PersonRun {
  date: string;
  track: string | null;
  state: string | null;
  distance: number | null;
  going: string | null;
  raceName: string | null;
  horse: string;
  finish: number;
  margin: number | null;
  runners: number | null;
  sp: number | null;
  weight: number | null;
  barrier: number | null;
  /** The trainer on a jockey's run, the jockey on a trainer's. */
  other: string | null;
  raceId: string;
}

export interface Breakdown {
  label: string;
  rides: number;
  wins: number;
  places: number;
  expected: number;
  winPct: number;
  power: number;
}

export interface PersonProfile {
  kind: "jockey" | "trainer";
  key: string;
  name: string;
  summary: Person;
  /** Where they sit in the all-time ranking, and how many are ranked. */
  rank: number;
  of: number;
  recent: PersonRun[];
  byTrack: Breakdown[];
  byDistance: Breakdown[];
  byGoing: Breakdown[];
  /** By the price the horse started at: where against the market they earn it. */
  byPrice: Breakdown[];
  byYear: Breakdown[];
  /** The people they team up with most. */
  with: Breakdown[];
  horses: Breakdown[];
}

const marketChance = (r: PersonRun & { bsp?: number | null }, c: Calibration) => (r.bsp && r.bsp > 1 ? c.bsp / r.bsp : r.sp && r.sp > 1 ? c.sp / r.sp : null);

type PricedRun = PersonRun & { bsp?: number | null };
function breakdown(runs: PricedRun[], c: Calibration, label: (r: PricedRun) => string | null, min = 3): Breakdown[] {
  const by = new Map<string, Breakdown & { priced: number; winsPriced: number }>();
  for (const r of runs) {
    const l = label(r);
    if (!l) continue;
    const b = by.get(l) ?? { label: l, rides: 0, wins: 0, places: 0, expected: 0, winPct: 0, power: 0, priced: 0, winsPriced: 0 };
    b.rides++; if (r.finish === 1) b.wins++; if (r.finish <= 3) b.places++;
    const p = marketChance(r, c);
    if (p !== null) { b.priced++; b.expected += p; if (r.finish === 1) b.winsPriced++; }
    by.set(l, b);
  }
  return [...by.values()]
    .filter((b) => b.rides >= min)
    .map(({ priced, winsPriced, ...b }) => ({ ...b, expected: Math.round(b.expected * 10) / 10, winPct: Math.round((100 * b.wins) / b.rides * 10) / 10, power: powerOf(winsPriced, b.expected, priced) }))
    .sort((a, b) => b.rides - a.rides);
}

const PRICE_BANDS = ["Under $2", "$2 to $3", "$3 to $5", "$5 to $8", "$8 to $15", "$15 to $30", "$30 and up"];
const priceBand = (p: number | null | undefined) => (!p || p <= 1 ? null : p < 2 ? PRICE_BANDS[0] : p < 3 ? PRICE_BANDS[1] : p < 5 ? PRICE_BANDS[2] : p < 8 ? PRICE_BANDS[3] : p < 15 ? PRICE_BANDS[4] : p < 30 ? PRICE_BANDS[5] : PRICE_BANDS[6]);
const distanceBand = (d: number | null) => (d === null ? null : d < 1150 ? "Sprint, under 1150m" : d < 1350 ? "1150 to 1349m" : d < 1650 ? "1350 to 1649m" : d < 2050 ? "1650 to 2049m" : "2050m and up");

/** One jockey or trainer: their record, where they do it, who with, and their last runs. */
export async function hubPerson(kind: "jockey" | "trainer", key: string): Promise<PersonProfile | undefined> {
  "use cache";
  cacheLife("hours");
  const [data, all, c] = await Promise.all([rpcAll("hub_person_runs", { p_kind: kind, p_key: key }, 3000), hubPeople(kind), calibration()]);
  const rows = data.map((r) => ({
    date: String(r.date), track: (r.track as string | null) ?? null, state: (r.state as string | null) ?? null, distance: r.distance === null ? null : Number(r.distance),
    going: (r.going as string | null) ?? null, raceName: (r.race_name as string | null) ?? null, horse: String(r.horse), finish: Number(r.finish),
    margin: r.margin === null ? null : Number(r.margin), runners: r.runners === null ? null : Number(r.runners), sp: r.sp === null ? null : Number(r.sp), bsp: r.bsp === null ? null : Number(r.bsp),
    weight: r.weight === null ? null : Number(r.weight), barrier: r.barrier === null ? null : Number(r.barrier), other: (r.other as string | null) ?? null, raceId: String(r.race_id),
  }));
  if (rows.length === 0) return undefined;
  const rank = all.findIndex((p) => p.key === key);
  const summary = rank >= 0 ? all[rank] : person({ name: key, rides: rows.length, wins: 0, places: 0, priced_bsp: 0, priced_sp: 0, wins_bsp: 0, wins_sp: 0, expected_bsp: 0, expected_sp: 0, rides_30: 0, wins_30: 0, last_ride: rows[0].date, win_sp: null, first_ride: rows[rows.length - 1].date }, c);
  return {
    kind, key, name: summary.name, summary, rank: rank + 1, of: all.length,
    recent: rows.slice(0, 40).map(({ bsp: _b, ...r }) => { void _b; return r; }),
    byTrack: breakdown(rows, c, (r) => r.track, 1),
    byDistance: breakdown(rows, c, (r) => distanceBand(r.distance)),
    byGoing: breakdown(rows, c, (r) => (r.going ? r.going.replace(/\s*\d+$/, "") : null)),
    byPrice: breakdown(rows, c, (r) => priceBand(r.bsp ?? r.sp)).sort((a, b) => PRICE_BANDS.indexOf(a.label) - PRICE_BANDS.indexOf(b.label)),
    byYear: breakdown(rows, c, (r) => r.date.slice(0, 4)).sort((a, b) => b.label.localeCompare(a.label)),
    with: breakdown(rows, c, (r) => (r.other ? displayName(r.other) : null)).slice(0, 12),
    horses: breakdown(rows, c, (r) => r.horse, 2).slice(0, 12),
  };
}

export interface TrackDistance {
  track: string;
  state: string | null;
  distance: number;
  runs: number;
  races: number;
  /** Typical time, seconds. */
  median: number;
  /** Quickest time we hold, seconds. */
  best: number;
  good: number | null;
  soft: number | null;
  heavy: number | null;
  /** Lengths the feed's benchmark has runs here under class on average. */
  vsBench: number | null;
  lastRun: string;
  /** Lengths quicker (+) or slower (-) than the typical time over this distance everywhere. */
  speed: number | null;
}

async function trackDistancesRaw(): Promise<TrackDistance[]> {
  const data = await rpcAll("hub_track_distances");
  const rows = data.map((r) => ({
    track: String(r.track), state: (r.state as string | null) ?? null, distance: Number(r.distance),
    runs: Number(r.runs), races: Number(r.races),
    median: Number(r.median_ms) / 1000,
    // A quickest time more than 8% under the median is one mislabelled run, not a record.
    best: Number(r.best_ms) / 1000 >= (Number(r.median_ms) / 1000) * 0.92 ? Number(r.best_ms) / 1000 : Number(r.median_ms) / 1000 * 0.92,
    good: r.good_ms === null ? null : Number(r.good_ms) / 1000,
    soft: r.soft_ms === null ? null : Number(r.soft_ms) / 1000,
    heavy: r.heavy_ms === null ? null : Number(r.heavy_ms) / 1000,
    vsBench: r.vs_bench === null ? null : Number(r.vs_bench),
    lastRun: String(r.last_run),
    speed: null as number | null,
  }));
  // Each distance's typical time is the median of the track medians with
  // twenty runs or more, so one track with a bad clock cannot drag the rest,
  // and a track needs twenty runs of its own before it gets a speed figure.
  const byDistance = new Map<number, number[]>();
  for (const r of rows) if (r.runs >= MIN_RUNS) byDistance.set(r.distance, [...(byDistance.get(r.distance) ?? []), r.median]);
  for (const r of rows) {
    const others = (byDistance.get(r.distance) ?? []).filter((m) => m !== r.median);
    if (r.runs < MIN_RUNS || others.length < 3) continue;
    r.speed = Math.round(((median(others) - r.median) / SECONDS_PER_LENGTH) * 10) / 10;
  }
  return rows;
}

export async function hubTrackDistances(): Promise<TrackDistance[]> {
  "use cache";
  cacheLife("hours");
  return (await readSnapshot<TrackDistance[]>("track-distances")) ?? trackDistancesRaw();
}

export interface Track {
  track: string;
  state: string | null;
  distances: number;
  runs: number;
  races: number;
  /** Lengths quicker (+) or slower (-) than typical, averaged over its distances, weighted by runs. */
  speed: number | null;
  vsBench: number | null;
  lastRun: string;
}

/** Every track, with how it runs against the rest. */
export async function hubTracks(): Promise<Track[]> {
  const rows = await hubTrackDistances();
  const by = new Map<string, Track & { speedW: number; speedN: number; benchW: number; benchN: number }>();
  for (const r of rows) {
    const t = by.get(r.track) ?? { track: r.track, state: r.state, distances: 0, runs: 0, races: 0, speed: null, vsBench: null, lastRun: r.lastRun, speedW: 0, speedN: 0, benchW: 0, benchN: 0 };
    t.distances++; t.runs += r.runs; t.races += r.races;
    if (r.lastRun > t.lastRun) t.lastRun = r.lastRun;
    if (r.speed !== null) { t.speedW += r.speed * r.runs; t.speedN += r.runs; }
    if (r.vsBench !== null) { t.benchW += r.vsBench * r.runs; t.benchN += r.runs; }
    by.set(r.track, t);
  }
  return [...by.values()]
    .map(({ speedW, speedN, benchW, benchN, ...t }) => ({ ...t, speed: speedN ? Math.round((speedW / speedN) * 10) / 10 : null, vsBench: benchN ? Math.round((benchW / benchN) * 100) / 100 : null }))
    .sort((a, b) => b.runs - a.runs);
}

export interface Distance {
  distance: number;
  tracks: number;
  runs: number;
  /** Typical time across every track, seconds. */
  typical: number;
  /** The quickest track by typical time, and the outright record. */
  quickest: string;
  quickestMedian: number;
  record: number;
  recordTrack: string;
}

/** Every distance, with the typical time, the quickest track and the record. */
export async function hubDistances(): Promise<Distance[]> {
  const rows = await hubTrackDistances();
  const by = new Map<number, Distance & { sum: number; medians: number[] }>();
  for (const r of rows) {
    const d = by.get(r.distance) ?? { distance: r.distance, tracks: 0, runs: 0, typical: 0, quickest: "", quickestMedian: Infinity, record: r.best, recordTrack: r.track, sum: 0, medians: [] };
    d.tracks++; d.runs += r.runs; d.sum += r.median * r.runs;
    if (r.runs >= MIN_RUNS) d.medians.push(r.median);
    // The quickest track needs twenty runs to count; with none that deep, the quickest of what there is.
    if ((r.runs >= MIN_RUNS || d.quickest === "") && r.median < d.quickestMedian) { d.quickest = r.track; d.quickestMedian = r.median; }
    if (r.best < d.record) { d.record = r.best; d.recordTrack = r.track; }
    by.set(r.distance, d);
  }
  return [...by.values()].map(({ sum, medians, ...d }) => ({ ...d, typical: medians.length ? median(medians) : sum / d.runs })).sort((a, b) => a.distance - b.distance);
}

export interface Going {
  track: string;
  distance: number;
  runs: number;
  good: number;
  soft: number | null;
  heavy: number | null;
  /** Seconds slower than good, and the same in lengths. */
  softPlus: number | null;
  heavyPlus: number | null;
  softLengths: number | null;
  heavyLengths: number | null;
}

/** Track and distance pairs with a good-track time to compare soft and heavy against. */
export async function hubGoings(): Promise<Going[]> {
  const rows = await hubTrackDistances();
  return rows
    .filter((r) => r.good !== null && (r.soft !== null || r.heavy !== null) && r.runs >= 20)
    .map((r) => {
      const softPlus = r.soft === null ? null : Math.round((r.soft - r.good!) * 100) / 100;
      const heavyPlus = r.heavy === null ? null : Math.round((r.heavy - r.good!) * 100) / 100;
      return {
        track: r.track, distance: r.distance, runs: r.runs, good: r.good!, soft: r.soft, heavy: r.heavy, softPlus, heavyPlus,
        softLengths: softPlus === null ? null : Math.round((softPlus / SECONDS_PER_LENGTH) * 10) / 10,
        heavyLengths: heavyPlus === null ? null : Math.round((heavyPlus / SECONDS_PER_LENGTH) * 10) / 10,
      };
    })
    .sort((a, b) => b.runs - a.runs);
}

/** 83.14 as 1:23.14, under a minute as 58.20. */
export const clock = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}` : s.toFixed(2));

/** HorseEdge's read of a track from its sectionals: how the race is usually run there and who wins. */
export interface TrackShape {
  distance: number;
  /** Share of the race's time spent early, mid and in the last 600. */
  earlyPct: number | null;
  midPct: number | null;
  finishPct: number | null;
  /** How often the front runner won here over this trip, and how often it held a place; from HorseEdge's race_pace, one row a race. */
  frontRunnerWinPct: number | null;
  leaderPlacedPct: number | null;
  /** Races behind the leader figures. */
  races: number | null;
  sample: number;
}
export interface TrackTempo {
  band: string;
  condition: string;
  earlyMean: number | null;
  middleMean: number | null;
  finish600Mean: number | null;
  /** Seconds added to the last 600 for each second the early part is run quicker. */
  coefficient: number | null;
  sample: number;
}
export interface TrackExtra {
  /** HorseEdge's speed index: negative is a quick track. */
  speedIndex: number | null;
  metro: boolean;
  shapes: TrackShape[];
  tempo: TrackTempo[];
}

export async function hubTrackExtra(track: string): Promise<TrackExtra> {
  "use cache";
  cacheLife("hours");
  const db = supabaseAdmin();
  const [{ data: speed }, { data: shapes }, { data: tempo }] = await Promise.all([
    db.from("bench_track_speed").select("*").eq("track", track).maybeSingle(),
    db.from("bench_track_profile").select("*").eq("track", track).order("distance"),
    db.from("bench_track_tempo").select("*").eq("track", track).order("distance_band").order("condition"),
  ]);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    speedIndex: speed ? Number(speed.speed_index) : null,
    metro: Boolean(speed?.metro),
    shapes: ((shapes ?? []) as Record<string, unknown>[]).map((r) => ({ distance: Number(r.distance), earlyPct: n(r.early_pct), midPct: n(r.mid_pct), finishPct: n(r.finish_pct), frontRunnerWinPct: n(r.front_runner_win_pct), leaderPlacedPct: n(r.leader_placed_pct), races: n(r.races), sample: Number(r.sample) })),
    tempo: ((tempo ?? []) as Record<string, unknown>[]).map((r) => ({ band: String(r.distance_band), condition: String(r.condition), earlyMean: n(r.early_mean), middleMean: n(r.middle_mean), finish600Mean: n(r.finish600_mean), coefficient: n(r.tempo_finish_coefficient), sample: Number(r.sample) })),
  };
}

/** Every track's shape over one distance: where the front runners win and where the closers do. */
export async function hubDistanceShapes(distance: number): Promise<(TrackShape & { track: string })[]> {
  "use cache";
  cacheLife("hours");
  const { data } = await supabaseAdmin().from("bench_track_profile").select("*").eq("distance", distance).order("races", { ascending: false, nullsFirst: false });
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ track: String(r.track), distance: Number(r.distance), earlyPct: n(r.early_pct), midPct: n(r.mid_pct), finishPct: n(r.finish_pct), frontRunnerWinPct: n(r.front_runner_win_pct), leaderPlacedPct: n(r.leader_placed_pct), races: n(r.races), sample: Number(r.sample) }));
}
