/**
 * The ratings engine.
 *
 * Every number here is in benchmark points, the scale handicappers already
 * read: a BM64 horse rates about 64, a Group 1 horse about 120 plus. A past
 * run is worth the benchmark of the race it was in, moved by how far above or
 * below the class benchmark the horse ran on the clock (Form King's vsClass,
 * in lengths). Results do not score: the time does.
 * The categories then split that by section, tempo and ground from the
 * sectional benchmarks. Form King's own ratings only nudge a runner within
 * the field; they are never restated.
 */

import type { BenchmarkedRun, PastEvent, RaceEntry, Speedmap } from "@/lib/formking/types";
import { freshFactor, weightFactor } from "./factors";
import type {
  Factor,
  GoingBand,
  MapPosition,
  RacePace,
  RunnerRatings,
  Signal,
  Tempo,
} from "./types";

export interface RatedEntry {
  key: string;
  ratings: RunnerRatings;
  form?: string;
}

/**
 * Class labels to benchmark points. Form King's `restrictions` string leads
 * with the class code ("72B", "C3", "MDN", "OPN", "LR", "G1"); race names
 * carry it in words ("Midway (Bm72)", "Class 3 Hcp", "Mdn Plate").
 */
const CLASS_TABLE: [RegExp, number][] = [
  [/^g1\b|group\s*1/i, 122],
  [/^g2\b|group\s*2/i, 112],
  [/^g3\b|group\s*3/i, 104],
  [/^lr\b|listed/i, 96],
  [/^opn\b|\bopen\b/i, 90],
  [/^mdn\b|maiden|\bmdn\b/i, 52],
  [/^c1\b|class\s*1\b/i, 58],
  [/^c2\b|class\s*2\b/i, 62],
  [/^c3\b|class\s*3\b/i, 66],
  [/^c4\b|class\s*4\b/i, 70],
  [/^c5\b|class\s*5\b/i, 74],
  [/^c6\b|class\s*6\b/i, 78],
  [/^cb\b/i, 60],
  [/^hdm|^hdl|^stm|hurdle|steeple/i, 70],
];

/** Parse a class out of a restrictions code or race name, if one is there. */
export function parseClass(text?: string): number | undefined {
  if (!text) return undefined;
  const t = text.trim();
  const bm = t.match(/(?:^|\(|\s)(?:bm|benchmark)\s*(\d{2,3})/i) ?? t.match(/^(\d{2,3})[BR+]/);
  if (bm) return Number(bm[1]);
  for (const [re, pts] of CLASS_TABLE) if (re.test(t)) return pts;
  return undefined;
}

/** Today's par: the restrictions code first, the race name second, else open. */
export function classPoints(restrictions?: string, raceName?: string): number {
  return parseClass(restrictions) ?? parseClass(raceName) ?? 90;
}

/**
 * Three bands from a going string. Form King still prints the old words
 * ("Dead 5", "Slow 6"), so the number decides where one is present: 1-4 good,
 * 5-7 soft, 8-10 heavy.
 */
export function goingBand(going?: string): GoingBand {
  const g = (going ?? "").toLowerCase();
  const n = Number(g.match(/(\d+)/)?.[1]);
  if (n >= 8) return "heavy";
  if (n >= 5) return "soft";
  if (n >= 1) return "good";
  if (g.startsWith("heavy")) return "heavy";
  if (g.startsWith("dead") || g.startsWith("slow") || g.startsWith("soft")) return "soft";
  return "good";
}

/** The current Australian scale: Firm 1-2, Good 3-4, Soft 5-7, Heavy 8-10. */
export function goingLabel(going?: string, goingNumber?: number): string | undefined {
  const n = goingNumber || Number((going ?? "").match(/(\d+)/)?.[1]) || undefined;
  if (n === undefined) return going || undefined;
  if (n >= 8) return `Heavy ${n}`;
  if (n >= 5) return `Soft ${n}`;
  if (n >= 3) return `Good ${n}`;
  if (n >= 1) return `Firm ${n}`;
  return going || undefined;
}

/** Points per length above or below the class benchmark. */
const POINTS_PER_LENGTH = 1.2;
/**
 * Without a benchmark all we know is the beaten margin, which says little
 * about how fast the race was run, so it counts for half and never above par.
 * Winning is not rewarded on its own: a win in a slowly run race is a run to
 * par, and a close fourth in a fast one can rate above it.
 */
const MARGIN_WEIGHT = 0.5;
/** Recency weights over the last runs, most recent first. */
const RUN_WEIGHTS = [0.35, 0.25, 0.2, 0.12, 0.08];
/** Prior weight, in runs, that pulls a thin category back toward class. */
const SHRINK = 2;
/** How far a within-field Form King edge can move a runner. */
const FK_NUDGE = 1.5;
/** Leader early lengths vs class that make a run's tempo fast or slow. */
const TEMPO_LENGTHS = 1.5;

export interface RaceContext {
  classPoints: number;
  going: GoingBand;
  distance: number;
  track?: string;
}

/** How much of each category's gap to class makes it into Today. */
const WEIGHTS = { going: 0.5, tempo: 0.5, distance: 0.5, track: 0.3 };
/** Caps on the smaller factors, in points. */
const CAP = { weight: 4, fresh: 3, jockey: 0.8, trainer: 0.5 };

export function rateEntries(
  entries: RaceEntry[],
  race: RaceContext,
  speedmap?: Speedmap,
): { rated: RatedEntry[]; pace: RacePace } {
  const live = entries.filter((e) => !e.scratched);
  const fk = zscores(live.map((e) => e.ratings?.peak12m ?? e.ratings?.peak));

  const base = live.map((e, i) => rateOne(e, race, fk[i]));

  // Predicted settling order: the speed map first, settling positions in past
  // runs otherwise, both scaled 0-1 with 1 the fastest.
  const bySpeed = new Map(
    speedmap?.entries.map((s) => [s.number, s.earlySpeedValues?.overall]) ?? [],
  );
  const earlyProxy = live.map((e) => {
    const sm = bySpeed.get(e.number);
    if (sm !== undefined) return sm / 10;
    return settlingProxy(e) - (e.barrier - 6) * 0.01;
  });
  const order = earlyProxy
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.i);

  const pace = paceOf(earlyProxy, speedmap?.expectedTempo?.description);
  const n = live.length;

  // Two horses can share the lead when the second is within a whisker of the
  // first on early speed.
  const topSpeed = earlyProxy[order[0]] ?? 0;
  const coLeaders = order.length > 1 && topSpeed - earlyProxy[order[1]] <= 0.08 ? 2 : 1;

  const rated = live.map((e, i) => {
    const ppir = order.indexOf(i) + 1;
    const r = base[i];
    const tempoFit =
      pace.tempo === "fast" ? r.tempo.fast : pace.tempo === "slow" ? r.tempo.slow : r.class;

    // Every adjustment is named, so the card can say why Today is not Class.
    const factors: Partial<Record<Factor, number>> = {
      going: WEIGHTS.going * (r.going[race.going] - r.class),
      tempo: WEIGHTS.tempo * (tempoFit - r.class),
      distance: WEIGHTS.distance * (r.distance - r.class),
      track: WEIGHTS.track * (r.track - r.class),
      weight: weightFactor(e),
      fresh: freshFactor(e, r.class, (p) => runPoints(p, race.classPoints, e.horse.age)),
      jockey: clamp(((e.jockeyForm?.lastTwelveMonthWinPercentage ?? 12) - 12) * 0.06, -CAP.jockey, CAP.jockey),
      trainer: clamp(((e.trainerForm?.lastTwelveMonthWinPercentage ?? 12) - 12) * 0.04, -CAP.trainer, CAP.trainer),
      market: fk[i] * FK_NUDGE,
    };
    for (const k of Object.keys(factors) as Factor[]) {
      const v = round1(factors[k] ?? 0);
      if (v === 0) delete factors[k];
      else factors[k] = v;
    }
    const today = round1(r.class + Object.values(factors).reduce((a, b) => a + b, 0));

    return {
      key: String(e.number),
      form: e.form?.runs?.slice(-6),
      ratings: { ...r, today, factors, ppir, map: mapOf(ppir, n, coLeaders) },
    };
  });

  return { rated, pace };
}

function rateOne(
  e: RaceEntry,
  race: RaceContext,
  fkZ: number,
): Omit<RunnerRatings, "today" | "factors" | "ppir" | "map"> {
  const runs = (e.pastEvents ?? [])
    .filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched && !isJumps(p.raceName))
    .sort((a, b) => b.date - a.date)
    .slice(0, RUN_WEIGHTS.length);

  // No form to go on: the official rating if there is one, else just under
  // today's par, and let Form King's view separate it from the others.
  if (runs.length === 0) {
    const ohr = e.benchmarkRating ? clamp(e.benchmarkRating, race.classPoints - 15, race.classPoints + 25) : undefined;
    const c = round1((ohr ?? race.classPoints - 2) + fkZ * FK_NUDGE);
    return {
      class: c, early: c, mid: c, late: c, pressure: c,
      tempo: { fast: c, slow: c },
      going: { good: c, soft: c, heavy: c },
      distance: c,
      track: c,
      runs: 0,
    };
  }

  const points = runs.map((r) => runPoints(r, race.classPoints, e.horse.age));
  const weighted =
    points.reduce((a, p, i) => a + p * RUN_WEIGHTS[i], 0) /
    RUN_WEIGHTS.slice(0, points.length).reduce((a, b) => a + b, 0);
  const peak = Math.max(...points.slice(0, 3));
  const cls = 0.6 * peak + 0.4 * weighted;

  const splits = runs
    .map((r) => (r.benchmark ? splitOf(r.benchmark) : undefined))
    .filter((x): x is Split => x !== undefined);

  const section = (pick: (s: Split) => number | undefined) => {
    const ls = splits.map(pick).filter((d): d is number => d !== undefined);
    return ls.length ? cls + POINTS_PER_LENGTH * mean(ls) : cls;
  };

  const subset = (keep: (r: PastEvent) => boolean) => {
    const ps = runs.filter(keep).map((r) => runPoints(r, race.classPoints, e.horse.age));
    return (ps.reduce((a, b) => a + b, 0) + cls * SHRINK) / (ps.length + SHRINK);
  };

  const late = section((s) => s.late);
  const hotLate = splits
    .filter((s) => s.tempo === "fast")
    .map((s) => s.late)
    .filter((d): d is number => d !== undefined);
  const tempoOf = (r: PastEvent) => (r.benchmark ? splitOf(r.benchmark).tempo : undefined);

  return {
    class: round1(cls),
    early: round1(section((s) => s.early)),
    mid: round1(section((s) => s.mid)),
    late: round1(late),
    pressure: round1(hotLate.length ? cls + POINTS_PER_LENGTH * mean(hotLate) : late - 1),
    tempo: {
      fast: round1(subset((r) => tempoOf(r) === "fast")),
      slow: round1(subset((r) => tempoOf(r) === "slow")),
    },
    going: {
      good: round1(subset((r) => goingBand(r.going) === "good")),
      soft: round1(subset((r) => goingBand(r.going) === "soft")),
      heavy: round1(subset((r) => goingBand(r.going) === "heavy")),
    },
    distance: round1(subset((r) => Math.abs(r.distance - race.distance) <= 200)),
    track: round1(subset((r) => sameTrack(r.track, race.track))),
    runs: runs.length,
  };
}

const sameTrack = (a?: string, b?: string) =>
  Boolean(a && b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();

/** Hurdles and steeplechases are rated on their own scale and never count. */
export const isJumps = (raceName?: string) => /\b(stpl|steeple|steeplechase|hdle|hurdle|jumps?)\b/i.test(raceName ?? "");

/**
 * What one run was worth. The race's benchmark comes from its name, falling
 * back to the horse's official rating at the time, then Form King's overall
 * time performance in lengths vs the class benchmark moves it up or down.
 * The result itself never adds points.
 */
export function runPoints(r: PastEvent, todayPar: number, ageNow?: number): number {
  // Today's race is the prior for the level a horse races at: an official
  // rating is trusted only within reach of it, an unparsed race name means par.
  // A jumper's BM120 or a horse dropping from a much stronger grade says
  // little about a flat maiden, so the run's par stays within reach too.
  const ohr = r.benchmarkRating && r.benchmarkRating > 0 ? r.benchmarkRating : undefined;
  // Two-year-old races are their own world: a "2YO Open" or a juvenile
  // Listed race says nothing about open benchmark company, so the race name
  // is ignored and the run starts at the bottom of today's range, lifted
  // only by an official rating and never above today's par.
  const juvenile = wasJuvenile(r, ageNow);
  // "Open Hcp" at a bush track is not open company: without an explicit
  // benchmark, class, group or listed tag the run can only sit a little
  // above today's par.
  const explicit = EXPLICIT_CLASS.test(r.raceName ?? "");
  const reach = juvenile ? 0 : !explicit ? 8 : todayPar <= 55 ? 12 : 25;
  const level = juvenile ? (ohr ?? todayPar - 15) : (parseClass(r.raceName) ?? ohr ?? todayPar);
  const par = clamp(level, todayPar - 15, todayPar + reach);
  const raw = r.benchmark
    ? par + r.benchmark.vsClass * POINTS_PER_LENGTH
    : par - Math.min(15, (r.margin ?? ((r.finishPosition ?? 6) - 1) * 1.2) * POINTS_PER_LENGTH * MARGIN_WEIGHT);
  return clamp(raw, par - 25, par + (juvenile ? 8 : 15));
}

/** Race names that pin the grade down, as opposed to "Open Hcp" or "Plate". */
const EXPLICIT_CLASS = /bm\s?\d|benchmark|class\s?\d|\bcl\s?\d|group\s?\d|\bg[123]\b|listed|mdn|maiden|\brs\d|\d{2,3}[BR+]|stakes|cup\b|guineas|derby|oaks/i;

/**
 * Whether the horse was two when it ran: the race name says so, or its age
 * now minus the 1 August birthdays since the run leaves it at two or under.
 */
export function wasJuvenile(r: PastEvent, ageNow?: number): boolean {
  if (/\b2\s?yo?\b|two[- ]year/i.test(r.raceName ?? "")) return true;
  if (!ageNow) return false;
  const run = new Date(r.date);
  const now = new Date();
  let birthdays = 0;
  for (let y = run.getFullYear(); y <= now.getFullYear(); y++) {
    const aug = new Date(Date.UTC(y, 7, 1));
    if (aug > run && aug <= now) birthdays++;
  }
  return ageNow - birthdays <= 2;
}

interface Split {
  early?: number;
  mid?: number;
  late?: number;
  tempo?: Tempo;
}

/**
 * Early, mid and late lengths vs class from the benchmarked sections, plus
 * the tempo of that race: the leader's early section vs class is
 * (vsClass - vsLeader), as the spec suggests.
 */
function splitOf(b: BenchmarkedRun): Split {
  const s = b.sections ?? {};
  const first = s["S-12"] ?? s["S-10"] ?? s["S-8"] ?? s["S-6"];
  const mids = [s["12-10"], s["10-8"], s["8-6"]].filter((x) => x !== undefined);
  const midSec = mids.length ? mids : s["6-4"] ? [s["6-4"]] : [];
  const last = s["6-F"] ?? s["4-F"] ?? s["2-F"];

  let tempo: Tempo | undefined;
  if (first) {
    const leader = first.vsClass - first.vsLeader;
    tempo = leader >= TEMPO_LENGTHS ? "fast" : leader <= -TEMPO_LENGTHS ? "slow" : "even";
  }

  return {
    early: first?.vsClass,
    mid: midSec.length ? mean(midSec.map((x) => x.vsClass)) : undefined,
    late: last?.vsClass,
    tempo,
  };
}

/** Where the horse usually settles, 1 for the lead, from past runs. */
function settlingProxy(e: RaceEntry): number {
  const xs = (e.pastEvents ?? [])
    .filter((p) => p.race !== false && p.posSettling && p.numRunners && p.numRunners > 1)
    .slice(0, 5)
    .map((p) => 1 - (p.posSettling! - 1) / (p.numRunners! - 1));
  return xs.length ? mean(xs) : 0.5;
}

/** Tempo call: Form King's expected tempo if we have it, else our own read. */
function paceOf(earlyProxy: number[], expected?: string): RacePace {
  const top = [...earlyProxy].sort((a, b) => b - a).slice(0, 3);
  const pressure = round2(top.length ? mean(top) : 0.5);
  let tempo: Tempo = pressure >= 0.82 ? "fast" : pressure <= 0.62 ? "slow" : "even";
  if (expected) {
    if (/fast|genuine|strong|hot/i.test(expected)) tempo = "fast";
    else if (/slow|soft/i.test(expected)) tempo = "slow";
    else if (/average|even|moderate/i.test(expected)) tempo = "even";
  }
  return { tempo, pressure };
}

export function mapOf(ppir: number, n: number, leaders = 1): MapPosition {
  if (ppir <= leaders) return "leader";
  if (ppir <= Math.ceil(n * 0.35)) return "on pace";
  if (ppir <= Math.ceil(n * 0.75)) return "midfield";
  return "back";
}

/**
 * One sentence on why a runner is in our top four. Leads on the rating, adds
 * the one thing that sets it apart, closes on the market.
 */
export function explain(
  r: RunnerRatings,
  rank: number,
  race: { going: GoingBand; tempo: Tempo },
  signal: Signal | undefined,
): string {
  const lead =
    rank === 1 ? `Rates top of the field at ${r.today}` : `Rates ${ordinal(rank)} at ${r.today}`;

  const edges: [number, string][] = [
    [r.late - r.class, "with the best closing sectionals"],
    [r.early - r.class, "with the early speed to control it"],
    [r.going[race.going] - r.class, `and goes better on ${race.going} ground`],
    [race.tempo === "fast" ? r.pressure - r.class : -99, "and holds on under a hot tempo"],
    [race.tempo === "slow" ? r.tempo.slow - r.class : -99, "and finishes off a slow tempo"],
  ];
  const [gap, phrase] = edges.sort((a, b) => b[0] - a[0])[0];
  const strength = gap >= 1.5 ? ` ${phrase}` : "";

  const map =
    r.map === "leader"
      ? ", maps to lead"
      : r.map === "on pace"
        ? ", gets an on-pace run"
        : r.map === "back"
          ? ", needs luck from the back"
          : "";

  const tail =
    signal === "back"
      ? ", and the market is longer than our price."
      : signal === "lay"
        ? ", but the market has it too short."
        : ".";

  return `${lead}${strength}${map}${tail}`;
}

/** One sentence on what decides the race. */
export function verdict(
  top: { horseName: string; ratings: RunnerRatings }[],
  tempo: Tempo,
): string {
  if (top.length < 2) return "Too little form to call.";
  const [a, b] = top;
  const closer = [...top].sort((x, y) => y.ratings.late - x.ratings.late)[0];
  const rival = closer.horseName === a.horseName ? b : closer;
  if (tempo === "fast") {
    return `Whether ${a.horseName} settles close enough to hold off ${rival.horseName} once the fast pace bites.`;
  }
  if (tempo === "slow") {
    return `Whether ${rival.horseName} gets into it early enough to run down ${a.horseName} off a slow tempo.`;
  }
  return `${a.horseName} against ${b.horseName} at level terms, with nothing in the map to tip it.`;
}

function zscores(values: (number | undefined)[]): number[] {
  const known = values.filter((v): v is number => v !== undefined);
  if (known.length < 2) return values.map(() => 0);
  const m = mean(known);
  const sd = Math.sqrt(mean(known.map((v) => (v - m) ** 2))) || 1;
  return values.map((v) => (v === undefined ? 0 : clamp((v - m) / sd, -2.5, 2.5)));
}

const ordinal = (n: number) => ["", "first", "second", "third", "fourth"][n] ?? `${n}th`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
