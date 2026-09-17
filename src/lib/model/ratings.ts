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
import { barrierFactor, distanceGapFactor, freshFactor, layoffFactor, weightFactor } from "./factors";
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
  // "C1" leads a restrictions code, and sits in brackets or after a space in a race name.
  [/(?:^|\(|\s)c\s?1\b|class\s*1\b/i, 58],
  [/(?:^|\(|\s)c\s?2\b|class\s*2\b/i, 62],
  [/(?:^|\(|\s)c\s?3\b|class\s*3\b/i, 66],
  [/(?:^|\(|\s)c\s?4\b|class\s*4\b/i, 70],
  [/(?:^|\(|\s)c\s?5\b|class\s*5\b/i, 74],
  [/(?:^|\(|\s)c\s?6\b|class\s*6\b/i, 78],
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
export const POINTS_PER_LENGTH = 1.2;
/**
 * Without a benchmark all we know is the beaten margin, which says little
 * about how fast the race was run, so it counts for half and never above par.
 * Winning is not rewarded on its own: a win in a slowly run race is a run to
 * par, and a close fourth in a fast one can rate above it.
 */
const MARGIN_WEIGHT = 0.5;
/** Points above its official rating a run's par may sit, whatever the race was called. */
const OHR_REACH = 10;
/** Points above today's par a run may sit when today is a maiden or class 1; 25 above that. Sweep with scripts/sweep-caps.ts. */
const LOW_REACH = Number(process.env.OVERLAY_LOW_REACH ?? 12);
/**
 * Lengths the clock may put a run below the beaten-margin reading of the same
 * run. The overall time in a slowly run staying race has every runner lengths
 * under class, the Oaks runner-up included, when the margin says she was
 * beaten four; this bounds the clock by the margin. Infinity trusts the clock.
 */
const CLOCK_FLOOR = Number(process.env.OVERLAY_CLOCK_FLOOR ?? Infinity);
/** Level for a derby, oaks or guineas with no group tag in its name; 0 leaves it to the official rating. */
const STAKES_LEVEL = Number(process.env.OVERLAY_STAKES_LEVEL ?? 0);
/** How far a raced horse's class is pulled toward its current official rating, 0-1. */
const OHR_PULL = Number(process.env.OVERLAY_OHR_PULL ?? 0);
/**
 * A run's par from the feed's measured strength of that race rather than
 * its name: 1 on, 0 off. On since 17 Sep 2026: over 743 cached races the
 * form's top pick went from winning 21% to 25%, the market favourite ranked
 * fourth or worse in 35% of races instead of 41%, and the bets turned from
 * -2% to +17% (scripts/sweep-caps.ts, scripts/out/rankers.ts). The name and
 * its caps stay as the fallback for a run the feed has not benchmarked.
 * The feed's race rating sits on a flatter class scale
 * than the names (a maiden about 77, a BM90 about 90, open 96), so a par
 * from a name or a mark is mapped onto it with RR_A + RR_B * points, fitted
 * over the cache in scripts/out/run-vs-wfa.ts. Lengths stay 1.2 points each.
 */
const RR_PAR = Number(process.env.OVERLAY_RR_PAR ?? 1) === 1;
const RR_A = Number(process.env.OVERLAY_RR_A ?? 56);
const RR_B = Number(process.env.OVERLAY_RR_B ?? 0.4);
/** Our benchmark points onto the feed's class scale. */
export const toFeedScale = (points: number) => (RR_PAR ? RR_A + RR_B * points : points);
/**
 * What a length on the overall clock is worth, by trip. A length is the same
 * fifth of a second everywhere, but a smaller share of the race the further
 * it goes, and the feed's own run figures move about 0.6 a length at 1200m
 * and 0.3 at 2400m. CLOCK_SCALE multiplies POINTS_PER_LENGTH; CLOCK_BY_TRIP
 * 1 shrinks it with distance as 1200 / trip, floored at a third.
 */
const CLOCK_SCALE = Number(process.env.OVERLAY_CLOCK_SCALE ?? 1);
const CLOCK_BY_TRIP = Number(process.env.OVERLAY_CLOCK_BY_TRIP ?? 1) === 1;
export const clockPoints = (distance?: number) => POINTS_PER_LENGTH * CLOCK_SCALE * (CLOCK_BY_TRIP && distance ? Math.max(1 / 3, Math.min(1, 1200 / distance)) : 1);
/**
 * Points below today's par a run as a two-year-old starts from, before the
 * clock moves it. Zero: the benchmark is already the horse's time against
 * that race's standard, and scripts/sweep-juvenile.ts over the resulted
 * races in the cache had every extra point costing accuracy (at 15, form
 * saw 212 winners from juvenile-form runners where 230 won). Sweepable from
 * the env.
 */
const JUVENILE_DROP = Number(process.env.OVERLAY_JUVENILE_DROP ?? 0);
/** Weight on a benchmark built from overall time alone, no sectionals. */
const TIME_ONLY_WEIGHT = 0.5;
/** Recency weights over the last runs, most recent first. */
export const RUN_WEIGHTS = [0.35, 0.25, 0.2, 0.12, 0.08];
/** Prior weight, in runs, that pulls a thin category back toward class. */
const SHRINK = 2;
/** How far a within-field Form King edge can move a runner. */
const FK_NUDGE = 1.5;
/** Leader early lengths vs class that make a run's tempo fast or slow. */
export const TEMPO_LENGTHS = 1.5;

export interface RaceContext {
  classPoints: number;
  going: GoingBand;
  distance: number;
  track?: string;
  /** When the race is run, millis, so a replayed race counts birthdays to its own day. */
  date?: number;
}

/** How much of each category's gap to class makes it into Today. */
const WEIGHTS = { going: 0.5, tempo: 0.5, distance: 0.5, track: 0.3 };
/**
 * How much of the gap between the sectional profile that fits today's tempo
 * and class goes into Today: a hot tempo asks for the late sectional under
 * pressure, a slow one for early speed, an even one for the whole profile.
 * 0.25 from scripts/sweep-caps.ts on 17 Sep 2026: the best form log loss and the
 * favourite placed best, with the form still calibrated on its own pick; at
 * 0.5 and above it says 189 to 200 winners for 174 to 180. 0 leaves the
 * sectionals as a read-out only.
 */
const SECTION_WEIGHT = Number(process.env.OVERLAY_SECTION_WEIGHT ?? 0.25);
/**
 * The shape of the race, in points, from where the horse settles against how
 * the race will be run. Over the 743 cached races (scripts/out/pace-test.ts)
 * the market under-prices all of it: on the speed in a slow race won 13%
 * more than expected and off the speed 16% less; in a fast race the other
 * way, -8% and +4%; a strong closer is +6% in a fast race and -18% in a
 * crawl; and a contested lead, the two best early ratings within a point,
 * had the leaders winning 17% less than expected, a lone leader 4% more.
 * Three sizes, set with scripts/sweep-caps.ts:
 *   SHAPE_POINTS   the tempo swing, plus for the leaders in a crawl and the
 *                  closers in a hot race, minus the other way;
 *   CLOSER_POINTS  how much the swing grows with how well the horse closes
 *                  against this field;
 *   CONTEST_POINTS taken off the horses on the speed when the lead is
 *                  contested, a third of it given to a lone leader.
 * 0.5 / 0.5 / 1.5 from the sweep of 17 Sep 2026 over the same races the
 * effects were found in, so in sample: form log loss 0.3136 to 0.3133, the
 * rated price under the market's for the first time (0.2801 v 0.2804), the
 * form still calibrated on its own pick (185 said, 183 won). The contested
 * lead carries most of it; a bigger tempo swing (1 and up) has the form
 * over-calling its pick. Re-run as the cache grows.
 */
const SHAPE_POINTS = Number(process.env.OVERLAY_SHAPE_POINTS ?? 0.5);
const CLOSER_POINTS = Number(process.env.OVERLAY_CLOSER_POINTS ?? 0.5);
const CONTEST_POINTS = Number(process.env.OVERLAY_CONTEST_POINTS ?? 1.5);
/** Points of sectional gap that count as a real difference, the narrative's GAP. */
const SHAPE_GAP = 1.5;
/** Early-rating gap between the two best: under CONTESTED is a fight for the lead, LONE and over a leader on its own. */
const CONTESTED = 1;
const LONE = 3;
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
  // Our early rating, as a standing in this field 0-1, has a say in the order too.
  const earlyRank = (() => {
    const withForm = base.map((b, i) => ({ i, v: b.runs > 0 ? b.early - b.class : undefined }));
    const vals = withForm.map((x) => x.v).filter((v): v is number => v !== undefined);
    if (vals.length < 2) return live.map(() => undefined);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return withForm.map((x) => (x.v === undefined || hi === lo ? undefined : (x.v - lo) / (hi - lo)));
  })();
  const earlyProxy = live.map((e, i) => {
    const sm = bySpeed.get(e.number);
    const feed = sm !== undefined ? sm / 10 : settlingProxy(e) - (e.barrier - 6) * 0.01;
    const ours = earlyRank[i];
    // With a speed map in hand our say is EARLY_SAY; without one it is EARLY_SAY_NOMAP.
    const say = sm !== undefined ? EARLY_SAY : EARLY_SAY_NOMAP;
    return ours === undefined ? feed : feed + say * (ours - feed);
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

  // The field's closing sectional and the fight for the lead, for the shape of the race.
  const withForm = base.filter((b) => b.runs > 0);
  const fieldLate = withForm.length ? mean(withForm.map((b) => b.late)) : undefined;
  const earlyTop = withForm.map((b) => b.early).sort((a, b) => b - a);
  pace.leaderGap = earlyTop.length > 1 ? round1(earlyTop[0] - earlyTop[1]) : undefined;
  // Tempo as a number, slow -1 to fast +1.
  const t = pace.tempo === "fast" ? 1 : pace.tempo === "slow" ? -1 : 0;
  const shapeOf = (r: (typeof base)[number], map: MapPosition): number => {
    if (r.runs === 0 || fieldLate === undefined) return 0;
    const front = map === "leader" || map === "on pace";
    let out = 0;
    if (front) {
      // A hot race tests the leaders, a crawl hands it to them; a record under pressure halves the test.
      out -= SHAPE_POINTS * t * (t > 0 && r.pressure - r.class >= SHAPE_GAP ? 0.5 : 1);
      if (pace.leaderGap !== undefined && pace.leaderGap < CONTESTED) out -= CONTEST_POINTS;
      else if (pace.leaderGap !== undefined && pace.leaderGap >= LONE && map === "leader") out += CONTEST_POINTS / 3;
    } else {
      // The closers want it run hard, the more so the better they close against this field.
      const closer = clamp((r.late - fieldLate) / (2 * SHAPE_GAP), -1, 1);
      out += SHAPE_POINTS * t + CLOSER_POINTS * t * closer;
    }
    return out;
  };

  const rated = live.map((e, i) => {
    const ppir = order.indexOf(i) + 1;
    const r = base[i];
    const map = mapOf(ppir, n, coLeaders);
    const tempoFit =
      pace.tempo === "fast" ? r.tempo.fast : pace.tempo === "slow" ? r.tempo.slow : r.class;
    const sectionFit = pace.tempo === "fast" ? r.pressure : pace.tempo === "slow" ? r.early : (r.early + r.mid + r.late) / 3;

    // Every adjustment is named, so the card can say why Today is not Class.
    const factors: Partial<Record<Factor, number>> = {
      going: WEIGHTS.going * (r.going[race.going] - r.class),
      tempo: WEIGHTS.tempo * (tempoFit - r.class),
      distance: WEIGHTS.distance * (r.distance - r.class) + distanceGapFactor(runDistances(e), race.distance),
      track: WEIGHTS.track * (r.track - r.class),
      weight: weightFactor(e),
      fresh: freshFactor(e, r.class, (p) => runPoints(p, race.classPoints, e.horse.age, race.date)) + layoffFactor(e),
      jockey: clamp(((e.jockeyForm?.lastTwelveMonthWinPercentage ?? 12) - 12) * 0.06, -CAP.jockey, CAP.jockey),
      trainer: clamp(((e.trainerForm?.lastTwelveMonthWinPercentage ?? 12) - 12) * 0.04, -CAP.trainer, CAP.trainer),
      barrier: barrierFactor(live.filter((o) => o.barrier < e.barrier).length + 1, n, map, race.distance),
      sections: r.runs > 0 ? SECTION_WEIGHT * (sectionFit - r.class) : 0,
      shape: shapeOf(r, map),
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
      ratings: { ...r, today, factors, ppir, map },
    };
  });

  return { rated, pace };
}

/** The last runs the rating is built on: real races, most recent first. */
function recentRuns(e: RaceEntry) {
  return (e.pastEvents ?? [])
    .filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched && !isJumps(p.raceName))
    .sort((a, b) => b.date - a.date)
    .slice(0, RUN_WEIGHTS.length);
}

function rateOne(
  e: RaceEntry,
  race: RaceContext,
  fkZ: number,
): Omit<RunnerRatings, "today" | "factors" | "ppir" | "map"> {
  const runs = recentRuns(e);

  // No form to go on: the official rating if there is one, else just under
  // today's par, and let Form King's view separate it from the others.
  if (runs.length === 0) {
    const ohr = e.benchmarkRating ? clamp(e.benchmarkRating, race.classPoints - 15, race.classPoints + 25) : undefined;
    const c = round1(toFeedScale(ohr ?? race.classPoints - 2) + fkZ * FK_NUDGE);
    return {
      class: c, early: c, mid: c, late: c, pressure: c,
      tempo: { fast: c, slow: c },
      going: { good: c, soft: c, heavy: c },
      distance: c,
      track: c,
      runs: 0,
    };
  }

  const points = runs.map((r) => runPoints(r, race.classPoints, e.horse.age, race.date));
  const weighted =
    points.reduce((a, p, i) => a + p * RUN_WEIGHTS[i], 0) /
    RUN_WEIGHTS.slice(0, points.length).reduce((a, b) => a + b, 0);
  // Its best form: the mean of the best two of the last three, so one big
  // run lifts the rating but cannot carry it on its own.
  const best = [...points.slice(0, 3)].sort((a, b) => b - a);
  const peak = best.length >= 2 ? (best[0] + best[1]) / 2 : best[0];
  const formCls = 0.4 * peak + 0.6 * weighted;
  // The handicapper's number is public form too: a raced horse's class can be pulled toward it.
  const ohrNow = e.benchmarkRating && e.benchmarkRating > 0 ? toFeedScale(clamp(e.benchmarkRating, race.classPoints - 15, race.classPoints + 25)) : undefined;
  const cls = ohrNow !== undefined ? formCls + OHR_PULL * (ohrNow - formCls) : formCls;

  // Each run's sections with what a length was worth over that trip, so a
  // slowly run 2400m does not read as thirteen lengths of early speed.
  const splits = runs
    .filter((r) => r.benchmark)
    .map((r) => { const sp = splitOf(r.benchmark!); return { tempo: sp.tempo, ...sectionPoints(sp, r.distance, race.distance) }; });

  const section = (pick: (s: { early?: number; mid?: number; late?: number }) => number | undefined) => {
    const ps = splits.map(pick).filter((d): d is number => d !== undefined);
    return ps.length ? cls + mean(ps) : cls;
  };

  const subset = (keep: (r: PastEvent) => boolean) => {
    const ps = runs.filter(keep).map((r) => runPoints(r, race.classPoints, e.horse.age, race.date));
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
    pressure: round1(hotLate.length ? cls + mean(hotLate) : late - 1),
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

/** The distances of the runs the rating is built on. */
const runDistances = (e: RaceEntry) => recentRuns(e).map((r) => r.distance).filter((d): d is number => typeof d === "number" && d > 0);

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
export function runPoints(r: PastEvent, todayPar: number, ageNow?: number, asOf?: number): number {
  // Today's race is the prior for the level a horse races at: an official
  // rating is trusted only within reach of it, an unparsed race name means par.
  // A jumper's BM120 or a horse dropping from a much stronger grade says
  // little about a flat maiden, so the run's par stays within reach too.
  const ohr = r.benchmarkRating && r.benchmarkRating > 0 ? r.benchmarkRating : undefined;
  // Two-year-old races are their own world: a "2YO Open" or a juvenile
  // Listed race says nothing about open benchmark company, so the race name
  // is ignored and the run's par never sits above today's. The clock still
  // counts in full: the benchmark is the time against that race's standard.
  const juvenile = wasJuvenile(r, ageNow, asOf);
  // "Open Hcp" at a bush track is not open company: without an explicit
  // benchmark, class, group or listed tag the run can only sit a little
  // above today's par.
  const explicit = EXPLICIT_CLASS.test(r.raceName ?? "");
  const reach = juvenile ? 0 : !explicit ? 8 : todayPar <= 55 ? LOW_REACH : 25;
  const fromName = parseClass(r.raceName) ?? (STAKES_LEVEL > 0 && STAKES_NAMES.test(r.raceName ?? "") ? STAKES_LEVEL : undefined);
  const level = juvenile ? (ohr ?? todayPar - JUVENILE_DROP) : (fromName ?? ohr ?? todayPar);
  // The official rating caps how far a race's label can flatter the run: a
  // 45-rated horse beating four at Cobar in an "Open Hcp" ran in a 45 race.
  const ceiling = Math.min(todayPar + reach, ohr !== undefined ? ohr + OHR_REACH : Infinity);
  const named = clamp(level, Math.min(todayPar - 15, ceiling), ceiling);
  // The race's measured strength when the feed has it, else the name mapped onto that scale.
  const par = RR_PAR ? (r.benchmark?.raceRating ?? toFeedScale(named)) : named;
  // Overall time with no sectionals is a hand-held clock at a bush track, so
  // its lengths against class count for half.
  const trust = r.benchmark?.dataStage === "OVERALL_TIME_ONLY" ? TIME_ONLY_WEIGHT : 1;
  const byMargin = par - Math.min(15, (r.margin ?? ((r.finishPosition ?? 6) - 1) * 1.2) * POINTS_PER_LENGTH * MARGIN_WEIGHT);
  const raw = r.benchmark
    ? Math.max(par + r.benchmark.vsClass * clockPoints(r.distance) * trust, byMargin - CLOCK_FLOOR * POINTS_PER_LENGTH)
    : byMargin;
  return clamp(raw, par - 25, par + (juvenile ? 8 : 15));
}

/** Black type by tradition whatever the name omits. */
const STAKES_NAMES = /derby|oaks|guineas/i;
/** Race names that pin the grade down, as opposed to "Open Hcp" or "Plate". */
const EXPLICIT_CLASS = /bm\s?\d|benchmark|class\s?\d|\bcl\s?\d|group\s?\d|\bg[123]\b|listed|mdn|maiden|\brs\d|\d{2,3}[BR+]|stakes|cup\b|guineas|derby|oaks/i;

/**
 * Whether the horse was two when it ran: the race name says so, or its age
 * as of today's race minus the 1 August birthdays since the run leaves it at
 * two or under.
 */
export function wasJuvenile(r: PastEvent, ageNow?: number, asOf?: number): boolean {
  if (/\b2\s?yo?\b|two[- ]year/i.test(r.raceName ?? "")) return true;
  if (!ageNow) return false;
  const run = new Date(r.date);
  const now = asOf ? new Date(asOf) : new Date();
  let birthdays = 0;
  for (let y = run.getFullYear(); y <= now.getFullYear(); y++) {
    const aug = new Date(Date.UTC(y, 7, 1));
    if (aug > run && aug <= now) birthdays++;
  }
  return ageNow - birthdays <= 2;
}

export interface Split {
  early?: number;
  mid?: number;
  late?: number;
  tempo?: Tempo;
  /** The same sections against the field in that race rather than the class standard. */
  earlyField?: number;
  lateField?: number;
}
export function splitOf(b: BenchmarkedRun): Split {
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
    earlyField: first?.vsField,
    lateField: last?.vsField,
  };
}

/**
 * How the feed's section figures run by trip, over 26,446 runs in the cache
 * (scripts/out/section-bias.ts): the average early section at 2050m+ is 6.2
 * lengths under class against 1.9 in a sprint, because staying races are run
 * slow early against a fast standard, and the spread doubles. Mid is flat
 * everywhere. Each band's mean and spread, for early, mid and late, and the
 * spread of the field figures.
 */
const SECTION_BANDS: { to: number; early: [number, number]; mid: [number, number]; late: [number, number]; lateField: number }[] = [
  { to: 1150, early: [-1.9, 7.3], mid: [-0.9, 2.0], late: [-1.7, 5.5], lateField: 4.9 },
  { to: 1350, early: [-1.9, 7.5], mid: [-0.9, 1.5], late: [-1.7, 5.1], lateField: 4.1 },
  { to: 1650, early: [-2.2, 11.1], mid: [-0.6, 1.6], late: [-2.1, 6.2], lateField: 5.0 },
  { to: 2050, early: [-4.4, 13.9], mid: [-0.1, 1.9], late: [-2.7, 7.3], lateField: 5.3 },
  { to: Infinity, early: [-6.2, 14.9], mid: [-0.2, 1.8], late: [-3.8, 9.7], lateField: 7.3 },
];
/**
 * What is done to a section figure before it counts:
 *   0  the feed's lengths against class, scaled by trip like the overall clock;
 *   1  the trip band's average taken off first, so a slow-run 2400m reads
 *      against other 2400m races, then scaled by trip;
 *   2  read as it would at 1200m: the band's average off and the spread
 *      brought to the sprint's, at a flat 1.2 a length;
 *   3  read as it would over today's trip: the same, brought to today's
 *      band and today's points a length.
 * 2 since 17 Sep 2026, with the closing figure against the field: over the
 * cache the best form log loss (0.3130 from 0.3133), the form's top pick
 * winning 25.3%, and the form calibrated on it (185 said, 184 won). Taking
 * the band average off alone did not help: the doubled spread at distance is
 * as much of the problem as the bias. Set with scripts/sweep-caps.ts.
 */
const SECTION_NORM = Number(process.env.OVERLAY_SECTION_NORM ?? 2);
/** How far the running order moves from the feed's speed map toward our early rating's standing in the field, 0-1. Set with scripts/sweep-caps.ts. */
const EARLY_SAY = Number(process.env.OVERLAY_EARLY_SAY ?? 0);
const EARLY_SAY_NOMAP = Number(process.env.OVERLAY_EARLY_SAY_NOMAP ?? 0);
/** 1 builds the closing figure from the last 600 against the field in that race, on the sprint scale, instead of against class. */
const LATE_FIELD = Number(process.env.OVERLAY_LATE_FIELD ?? 1) === 1;

const bandOf = (distance: number) => SECTION_BANDS.find((b) => distance < b.to) ?? SECTION_BANDS[SECTION_BANDS.length - 1];

/**
 * A run's sections as points, ready to add to class: what that section is
 * worth in today's race. The run's figure is read as a standing among runs
 * over its own trip, then expressed over today's trip (mode 3) or the
 * sprint's (mode 2), so a slow first 1200m in an Oaks is an ordinary early
 * section for a 2400m race and not eleven points of missing speed.
 */
export function sectionPoints(split: Split, distance: number, today = distance): { early?: number; mid?: number; late?: number } {
  const band = bandOf(distance);
  const target = SECTION_NORM === 3 ? bandOf(today) : SECTION_BANDS[0];
  const per = clockPoints(distance);
  const one = (v: number | undefined, key: "early" | "mid" | "late") => {
    if (v === undefined) return undefined;
    if (SECTION_NORM === 1) return (v - band[key][0]) * per;
    if (SECTION_NORM >= 2) return (((v - band[key][0]) * target[key][1]) / band[key][1]) * (SECTION_NORM === 3 ? clockPoints(today) : POINTS_PER_LENGTH);
    return v * per;
  };
  const late = LATE_FIELD && split.lateField !== undefined ? ((split.lateField * target.lateField) / band.lateField) * (SECTION_NORM === 3 ? clockPoints(today) : POINTS_PER_LENGTH) : one(split.late, "late");
  return { early: one(split.early, "early"), mid: one(split.mid, "mid"), late };
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
