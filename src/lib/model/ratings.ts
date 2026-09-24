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
import { ownClock } from "./standards";
import { barrierFactor, distanceGapFactor, freshFactor, layoffFactor, parseRecord, prepStage, weightFactor } from "./factors";
import { barrierEffect } from "./barriers";
import fit from "./fit.json";
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
 * Whether a race's label pins its grade down: a benchmark, class, maiden,
 * group or listed tag. "Open", "Hcp" and the WA and NT codes the parser
 * does not know all fall to 90, which over the cache sat ten points over
 * the horses that turned up (a bush "Open Hcp" fields BM66 horses) where a
 * benchmark label sits two or three over its field.
 */
export function labelPinsGrade(restrictions?: string, raceName?: string): boolean {
  const s = `${restrictions ?? ""} ${raceName ?? ""}`;
  return /(?:^|\(|\s)(?:bm|benchmark)\s*\d{2,3}|^\d{2,3}[BR+]|(?:^|\(|\s)c\s?[1-6]\b|class\s*[1-6]\b|^g[123]\b|group\s*[123]|^lr\b|listed|^mdn\b|maiden|\bmdn\b|^cb\b/i.test(restrictions ?? "") ||
    /(?:^|\(|\s)(?:bm|benchmark)\s*\d{2,3}|class\s*[1-6]\b|group\s*[123]|\bg[123]\b|listed|maiden|\bmdn\b/i.test(raceName ?? "") || /group|listed|\bg[123]\b/i.test(s);
}

/**
 * Today's par for a race whose label does not pin its grade: the field's
 * mean class rating plus the points a benchmark race sits over its field,
 * on our scale. On since 20 Sep 2026: it changes neither the rating nor the
 * calls, and the par on screen and the review's ran-to stop reading a bush
 * "Open" as open company. 0 keeps the label's par.
 */
export const PAR_FROM_FIELD = Number(process.env.OVERLAY_PAR_FROM_FIELD ?? 1);
/** Points a benchmark race's par sits over its field's mean class, on the feed scale: 2 to 3 over the cache. */
const PAR_OVER_FIELD = 2.5;
export function parFromField(fieldClass: number): number {
  // Back from the feed scale onto ours: feed = 56 + 0.4 * points.
  return Math.round(((fieldClass + PAR_OVER_FIELD - RR_A) / RR_B) * 10) / 10;
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
 * Points above today's par the feed's own rating for a past race may sit
 * before it is capped, on our benchmark scale. The name's reach never
 * applied to the feed's rating, so a horse beaten eight lengths in a race
 * rated 90 dropped into a country BM58 as an 80 horse, top rated at $16;
 * over the two Saturdays of 12 and 19 Sep 2026 only 16% of the distance
 * we put between a horse and the field showed on the clock. Infinity is
 * no cap. Sweep with scripts/sweep-caps.ts.
 */
const RR_REACH = Number(process.env.OVERLAY_RR_REACH ?? Infinity);
/**
 * With the feed's rating as a run's par, how much of the beaten margin comes
 * off it, in points a length at the trip: 1 the full margin, 0 keeps the
 * lengths-against-class reading that counts the race's speed twice.
 */
const RR_MARGIN = Number(process.env.OVERLAY_RR_MARGIN ?? 0);
/** Points above the race's own rating a beaten horse's run may sit; Infinity is no cap. Sweep with scripts/sweep-caps.ts. */
const RR_BEATEN_CAP = Number(process.env.OVERLAY_RR_BEATEN_CAP ?? Infinity);
/** 1 caps the feed's race rating, as a run's par, at the horse's official rating then plus OHR_REACH; 0 lets it stand. Sweep with scripts/sweep-caps.ts. */
const RR_OHR_CAP = Number(process.env.OVERLAY_RR_OHR_CAP ?? 0) === 1;
/** 0 ignores a race rating the feed built from overall time alone (no sectionals); 1 uses it. Sweep with scripts/sweep-caps.ts. */
const RR_TIME_ONLY = Number(process.env.OVERLAY_RR_TIME_ONLY ?? 1);
/** 1 gives every run today's par, ignoring the race it was in: the clock alone rates it. Sweep with scripts/sweep-caps.ts. */
const FLAT_PAR = Number(process.env.OVERLAY_FLAT_PAR ?? 0) === 1;
/** Share of a run's par's distance from today's par that counts, 0-1. Sweep with scripts/sweep-caps.ts. */
const RR_SHRINK = Number(process.env.OVERLAY_RR_SHRINK ?? 1);
/**
 * Which factors count, and how much. Six are off since 20 Sep 2026: going,
 * distance, weight, fresh, trainer and barrier. Three separate readings
 * found them worthless or worse. Regressing runs on the marks (12 and 19
 * Sep) gave going −0.04 and distance −0.02 per point; the least-squares
 * rating (fit.json) put weight, barrier, going and tempo fit at nothing;
 * and over the 461 clean races of 11 to 20 Sep taking the six out moved
 * the form's log loss from 0.3139 to 0.3119, its top pick from 111 to 119
 * winners, the market favourite ranked fourth or worse from 148 races to
 * 124 and a $10+ shot on top from 112 races to 98, with both Saturdays and
 * midweek improving (scripts/sweep-caps.ts, scripts/out/top-price.ts).
 * Bairnsdale R5 the same day: the winner rated 1.7 points above our top
 * pick on class and 3.4 below it on Today, the gap all going, distance and
 * weight. Jockey, sections, shape, streak, tempo, track and the feed's
 * nudge stay: each one taken out costs top-pick winners.
 * OVERLAY_FACTOR_MULT="going=1,distance=0.5" overrides any of these for a sweep.
 */
/**
 * The rebuilt going and barrier, 20 Sep 2026, each behind a switch. Going:
 * the horse's career win record on today's ground (the feed's goingForm,
 * every start it has had) over what its career record overall predicts,
 * shrunk by GOING_K starts, times GOING_MODEL points per unit of surplus;
 * over the clean cache the surplus predicted the run at about 2 to 3 points
 * a unit (scripts/out/going-surplus.ts). Barrier: the gate's measured effect
 * at this track and trip from 205,000 runs (barriers.ts), in points.
 */
const GOING_MODEL = Number(process.env.OVERLAY_GOING_MODEL ?? 0);
const GOING_K = Number(process.env.OVERLAY_GOING_K ?? 4);
/**
 * On since 20 Sep 2026: over the 461 clean races the measured gate took the
 * form's log loss from 0.3117 to 0.3113, the top pick from 121 to 122
 * winners, the favourite ranked fourth or worse from 129 to 127 races and a
 * $10+ shot on top from 90 to 88, where the old hand-set barrier factor
 * cost winners (116). 0 turns it off. The going model stays off by default:
 * at 2 to 4 points a unit it is within noise of nothing on the rating, and
 * its value against the market is tested in scripts/fit-prob.ts as a price input.
 */
const BARRIER_MODEL = Number(process.env.OVERLAY_BARRIER_MODEL ?? 1) === 1;
const FACTOR_DEFAULT: Partial<Record<string, number>> = { going: GOING_MODEL > 0 ? 1 : 0, distance: 0, weight: 0, fresh: 0, trainer: 0, barrier: BARRIER_MODEL ? 1 : 0 };
/** Career starts and wins on a set of the feed's going buckets. */
function goingRecord(form: Record<string, string> | undefined, buckets: string[]) {
  let starts = 0, wins = 0;
  for (const b of buckets) { const rec = parseRecord(form?.[b]); if (rec) { starts += rec.starts; wins += rec.wins; } }
  return { starts, wins };
}
/**
 * Wins on today's ground over what the horse's career win rate predicts,
 * per start, shrunk by GOING_K starts. Wet is the feed's slow and heavy;
 * dry its fast, good and dead. Nought with no starts on the ground. This is
 * an input to the fitted price (rate.ts): over the clean cache it carried
 * more weight against the market than the rating itself did (+0.11 per
 * standard deviation to the rating's +0.09, scripts/fit-prob.ts).
 */
export function goingSurplus(form: Record<string, string> | undefined, going: GoingBand): number {
  if (!form) return 0;
  const on = goingRecord(form, going === "good" ? ["fast", "good", "dead"] : ["slow", "heavy"]);
  const all = goingRecord(form, Object.keys(form));
  if (on.starts === 0) return 0;
  const winRate = (all.wins + 0.5) / (all.starts + 4);
  return (on.wins - on.starts * winRate) / (on.starts + GOING_K);
}
/** The same surplus as points on the rating, GOING_MODEL a unit; off by default. */
function goingModelFactor(e: RaceEntry, going: GoingBand): number {
  return GOING_MODEL * goingSurplus(e.form?.goingForm, going);
}
const FACTOR_MULT: Partial<Record<string, number>> = {
  ...FACTOR_DEFAULT,
  ...Object.fromEntries(
    (process.env.OVERLAY_FACTOR_MULT ?? "")
      .split(",")
      .map((s) => s.trim().split("="))
      .filter(([k, v]) => k && v !== undefined && !Number.isNaN(Number(v)))
      .map(([k, v]) => [k, Number(v)]),
  ),
};
/**
 * How much of a horse's class rating's distance from the field's average
 * class rating is kept, for sweeping; 1 keeps it all.
 */
const CLASS_SHRINK = Number(process.env.OVERLAY_CLASS_SHRINK ?? 1);
/**
 * Lengths the clock may put a run below the beaten-margin reading of the same
 * run. The overall time in a slowly run staying race has every runner lengths
 * under class, the Oaks runner-up included, when the margin says she was
 * beaten four; this bounds the clock by the margin. Infinity trusts the clock.
 */
const CLOCK_FLOOR = Number(process.env.OVERLAY_CLOCK_FLOOR ?? Infinity);
/**
 * Lengths the clock may put a run above the full beaten-margin reading of
 * the same run. Every $10+ bet on 19 Sep 2026 rested on one run where the
 * clock said the horse ran well and the margin said it was beaten lengths;
 * the market believes the margin. Four from scripts/sweep-caps.ts on the
 * clean cache, 20 Sep 2026: bets went from -13% to -4% (Saturday -26% to
 * -16%, midweek +26% to +31%) for five fewer top-pick winners in 921
 * races; at two the bets gave some back, at nought the rating broke.
 * Infinity trusts the clock outright.
 */
const CLOCK_CEILING = Number(process.env.OVERLAY_CLOCK_CEILING ?? 4);
/**
 * Lengths of beaten margin at which the clock's forgiveness above the margin
 * has faded to nothing: a horse beaten a length keeps the full CLOCK_CEILING,
 * one beaten eight or more gets none, since an eleventh beaten ten lengths
 * was the eleventh best horse there however fast they went. Eight from
 * scripts/sweep-caps.ts on the clean days, 20 Sep 2026, with the six weak
 * factors already off: form log loss 0.3119 to 0.3117, top pick 119 to 121
 * winners, a $10+ shot on top in 98 races to 90, the favourite ranked
 * fourth or worse 124 to 129. Infinity keeps the forgiveness constant.
 */
const CEILING_FADE = Number(process.env.OVERLAY_CEILING_FADE ?? 8);
/**
 * Share of a run's worth that comes from the beaten margin at full weight
 * rather than the clock: 0 is the clock alone (with the ceiling), 1 the
 * margin alone. The fit of 20 Sep 2026 had the margin last start among the
 * five strongest signals on top of the clock. Sweep with scripts/sweep-caps.ts.
 */
const MARGIN_BLEND = Number(process.env.OVERLAY_MARGIN_BLEND ?? 0);
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
/** Below this a race rating is a placeholder, not a rating: the weakest real one in the cache is in the fifties. */
const RR_FLOOR = 30;
/** Our benchmark points onto the feed's class scale, to the tenth we show. */
export const toFeedScale = (points: number) => (RR_PAR ? Math.round((RR_A + RR_B * points) * 10) / 10 : points);
/**
 * What a length on the overall clock is worth, by trip. A length is the same
 * fifth of a second everywhere, but a smaller share of the race the further
 * it goes, and the feed's own run figures move about 0.6 a length at 1200m
 * and 0.3 at 2400m. CLOCK_SCALE multiplies POINTS_PER_LENGTH; CLOCK_BY_TRIP
 * 1 shrinks it with distance as 1200 / trip, floored at a third.
 */
const CLOCK_SCALE = Number(process.env.OVERLAY_CLOCK_SCALE ?? 1);
const CLOCK_BY_TRIP = Number(process.env.OVERLAY_CLOCK_BY_TRIP ?? 1) === 1;
/**
 * Our own clock beside the feed's: a run's time against our standard for
 * that track, distance and going (standards.ts). OWN_CLOCK_BLEND is its
 * share of the clock where the feed has a benchmark too; where the feed has
 * none, our clock stands in for the margin at OWN_CLOCK_ALONE of full
 * weight. Both 0 after the sweep of 17 Sep 2026: a quarter blend took the
 * form log loss from 0.3099 to 0.3123, because our standard is class-blind
 * (the typical time of every run at that track and trip) and the feed's
 * carries the class. Standing in for the margin was neutral. The standards
 * belong as a going and track adjustment on the feed's benchmark, not in
 * its place.
 */
const OWN_CLOCK_BLEND = Number(process.env.OVERLAY_OWN_CLOCK_BLEND ?? 0);
const OWN_CLOCK_ALONE = Number(process.env.OVERLAY_OWN_CLOCK_ALONE ?? 0);
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
/** Share of the class rating from the peak (the mean of the best two of the last three runs); the rest is the recency-weighted average. Sweep with scripts/sweep-caps.ts. */
const PEAK_SHARE = Number(process.env.OVERLAY_PEAK_SHARE ?? 0.4);
/** Prior weight, in runs, that pulls a thin category back toward class. */
const SHRINK = 2;
/** What a condition's runs are judged against: "class" (40% peak) or "weighted" (the horse's recency-weighted average). Sweep with scripts/sweep-caps.ts. */
const CATEGORY_BASE = process.env.OVERLAY_CATEGORY_BASE ?? "class";
/** How far a within-field Form King edge can move a runner. */
const FK_NUDGE = 1.5;
/**
 * How much a rating can be trusted, 0-1. A rating on two runs, one of them
 * on a bog, after a year off, is a guess dressed as a number; the price
 * should lean on the market for it. Runs count most (one run a third, five
 * runs in full), then how many of those carried sectionals, how many were on
 * heavy ground, and a break of 300 days or more. Sweep in scripts/sweep-caps.ts.
 */
function trustOf(runs: PastEvent[], daysSince?: number): number {
  if (runs.length === 0) return 0;
  const byRuns = [0, 0.35, 0.55, 0.75, 0.9, 1][Math.min(5, runs.length)];
  const withSections = runs.filter((r) => r.benchmark?.sections).length / runs.length;
  const heavy = runs.filter((r) => goingBand(r.going) === "heavy").length / runs.length;
  const fresh = daysSince !== undefined && daysSince >= 300 ? 0.7 : 1;
  return round2(clamp(byRuns * (0.7 + 0.3 * withSections) * (1 - 0.4 * heavy) * fresh, 0, 1));
}
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
/**
 * A horse on a winning run is going better than its clock says: over the
 * cache the form gave horses with their last two runs won about half their
 * real chance (18 said, 34 won of 152; 6 said, 12 won of 45 on three or
 * more), and laid ten of the eleven odds-on ones, six of which won. Points
 * per win in the run beyond the first, up to STREAK_MAX wins. Three from
 * scripts/sweep-streak.ts on 18 Sep 2026: the form's log loss falls at every
 * step to four, at three the streak horses price about right (23 said of
 * 34, 10 of 12) and the bet record is unchanged.
 */
const STREAK_POINTS = Number(process.env.OVERLAY_STREAK_POINTS ?? 3);
/**
 * How far a run's figure moves from the overall clock toward a faster
 * closing sectional. Off: over the cache every setting made the form price
 * worse (log loss 0.3083 to 0.3098 at a half), so the overall clock stands
 * even in a crawl then a sprint.
 */
const SPRINT_RESCUE = Number(process.env.OVERLAY_SPRINT_RESCUE ?? 0);
const STREAK_MAX = 3;
function streakFactor(e: RaceEntry, asOf?: number): number {
  let wins = 0;
  for (const p of recentRuns(e, asOf)) { if (p.finishPosition === 1) wins++; else break; }
  return STREAK_POINTS * Math.max(0, Math.min(wins, STREAK_MAX) - 1);
}

export function rateEntries(
  entries: RaceEntry[],
  race: RaceContext,
  speedmap?: Speedmap,
): { rated: RatedEntry[]; pace: RacePace } {
  const live = entries.filter((e) => !e.scratched);
  const fk = zscores(live.map((e) => e.ratings?.peak12m ?? e.ratings?.peak));

  const base = live.map((e, i) => rateOne(e, race, fk[i]));
  // For sweeping: pull every rated horse's class toward the field's average
  // class, moving its other ratings with it so the factors stay the same.
  if (CLASS_SHRINK !== 1) {
    const withForm = base.filter((b) => b.runs > 0);
    if (withForm.length >= 2) {
      const fieldClass = mean(withForm.map((b) => b.class));
      for (const b of base) {
        if (b.runs === 0) continue;
        const delta = (CLASS_SHRINK - 1) * (b.class - fieldClass);
        b.class += delta; b.early += delta; b.mid += delta; b.late += delta; b.pressure += delta;
        b.tempo = { fast: b.tempo.fast + delta, slow: b.tempo.slow + delta };
        b.going = { good: b.going.good + delta, soft: b.going.soft + delta, heavy: b.going.heavy + delta };
        b.distance += delta; b.track += delta;
      }
    }
  }

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
      going: GOING_MODEL > 0 ? goingModelFactor(e, race.going) : WEIGHTS.going * (r.going[race.going] - r.class),
      tempo: WEIGHTS.tempo * (tempoFit - r.class),
      distance: WEIGHTS.distance * (r.distance - r.class) + distanceGapFactor(runDistances(e, race.date), race.distance),
      track: WEIGHTS.track * (r.track - r.class),
      weight: weightFactor(e, race.date),
      fresh: freshFactor(e, r.class, (p) => runPoints(p, race.classPoints, e.horse.age, race.date), race.date) + layoffFactor(e),
      jockey: clamp(((e.jockeyForm?.lastTwelveMonthWinPercentage ?? 12) - 12) * 0.06, -CAP.jockey, CAP.jockey),
      trainer: clamp(((e.trainerForm?.lastTwelveMonthWinPercentage ?? 12) - 12) * 0.04, -CAP.trainer, CAP.trainer),
      barrier: BARRIER_MODEL
        ? round1(barrierEffect(race.track, race.distance, live.filter((o) => o.barrier < e.barrier).length + 1, n) * clockPoints(race.distance))
        : barrierFactor(live.filter((o) => o.barrier < e.barrier).length + 1, n, map, race.distance),
      sections: r.runs > 0 ? SECTION_WEIGHT * (sectionFit - r.class) : 0,
      shape: shapeOf(r, map),
      streak: streakFactor(e, race.date),
      market: fk[i] * FK_NUDGE,
    };
    for (const k of Object.keys(factors) as Factor[]) {
      const v = round1((factors[k] ?? 0) * (FACTOR_MULT[k] ?? 1));
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

  // The fitted rating: the same pieces, weighted by what predicted a run
  // against its field over the cache, centred on the field's mean class.
  if (FITTED) {
    const withForm = rated.map((x, i) => ({ x, e: live[i] })).filter(({ x }) => x.ratings.runs > 0);
    if (withForm.length >= 2) {
      const feats = withForm.map(({ x, e }) => fitFeatures(e, x.ratings, race));
      const centre = FIT.features.map((_, j) => mean(feats.map((f) => f[j])));
      const meanClass = mean(withForm.map(({ x }) => x.ratings.class));
      for (const [i, { x }] of withForm.entries()) {
        const y = FIT.beta.reduce((a, b, j) => a + (b * (feats[i][j] - centre[j])) / FIT.sd[j], 0);
        x.ratings.today = round1(meanClass + y);
      }
    }
  }

  return { rated, pace };
}

/**
 * The rating fitted over the cache (scripts/fit-rating.ts, 20 Sep 2026):
 * weights on the form's pieces estimated by least squares to predict a
 * run's beaten margin against its field, on August's races, and tested on
 * September's. On the test days it explained 13.5% of the run against the
 * field to the hand-set rating's 10.7%, put a $12+ shot on top in 49 races
 * where the hand-set rating did in 82, and picked the winner as often. Its
 * spread is honest, so it prices at its own temperature.
 */
export const FITTED = process.env.OVERLAY_FITTED === "1";
export const FIT_TEMPERATURE: number = Number(process.env.OVERLAY_FIT_TEMPERATURE ?? fit.temperature);
const FIT = fit as { features: readonly string[]; sd: number[]; beta: number[]; temperature: number };

/** The fitted rating's inputs for one runner, in the fit's feature order. */
export function fitFeatures(e: RaceEntry, g: RunnerRatings, race: RaceContext): number[] {
  const runs = recentRuns(e, race.date);
  const pts = runs.map((p) => runPoints(p, race.classPoints, e.horse.age, race.date));
  const f = g.factors as Record<string, number>;
  const best2 = [...pts].sort((a, b) => b - a).slice(0, 2);
  const v: Record<string, number> = {
    cls: g.class, last: pts[0] ?? g.class, second: pts[1] ?? pts[0] ?? g.class, best2: best2.length ? mean(best2) : g.class, meanRun: pts.length ? mean(pts) : g.class,
    trend: pts.length >= 3 ? mean(pts.slice(0, 2)) - mean(pts.slice(2)) : 0,
    early: g.early - g.class, mid: g.mid - g.class, late: g.late - g.class, pressure: g.pressure - g.class,
    tempoFit: f.tempo ?? 0, goingFit: f.going ?? 0, distFit: f.distance ?? 0, trackFit: f.track ?? 0,
    weight: f.weight ?? 0, fresh: f.fresh ?? 0, jockey: f.jockey ?? 0, trainer: f.trainer ?? 0, barrier: f.barrier ?? 0, streak: f.streak ?? 0, shape: f.shape ?? 0, fk: f.market ?? 0,
    trust: g.trust, runs: g.runs, ppir: g.ppir, lastMargin: runs[0]?.margin ?? 0, daysSince: Math.min(400, e.daysSinceLastRace ?? 30), prep: prepStage(e),
    ohr: e.benchmarkRating && e.benchmarkRating > 0 ? e.benchmarkRating - race.classPoints : 0,
  };
  return FIT.features.map((k) => v[k] ?? 0);
}

/** The last runs the rating is built on: real races, most recent first. */
/**
 * The last runs the rating is built on: real races, most recent first, and
 * only those before the race when its date is known. Form fetched after a
 * race carries the horse's later starts: the August Saturdays in the cache
 * had 3,238 of 8,937 runners with a run from after the race in their form,
 * 506 with a later win, and every sweep scored on them saw the future.
 */
export function recentRuns(e: RaceEntry, asOf?: number) {
  return (e.pastEvents ?? [])
    .filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched && !isJumps(p) && (!asOf || p.date < asOf))
    .sort((a, b) => b.date - a.date)
    .slice(0, RUN_WEIGHTS.length);
}

function rateOne(
  e: RaceEntry,
  race: RaceContext,
  fkZ: number,
): Omit<RunnerRatings, "today" | "factors" | "ppir" | "map"> {
  const runs = recentRuns(e, race.date);

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
      trust: 0,
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
  const formCls = PEAK_SHARE * peak + (1 - PEAK_SHARE) * weighted;
  // The handicapper's number is public form too: a raced horse's class can be pulled toward it.
  const ohrNow = e.benchmarkRating && e.benchmarkRating > 0 ? toFeedScale(clamp(e.benchmarkRating, race.classPoints - 15, race.classPoints + 25)) : undefined;
  const cls = ohrNow !== undefined ? formCls + OHR_PULL * (ohrNow - formCls) : formCls;

  // Each run's sections with what a length was worth over that trip, so a
  // slowly run 2400m does not read as thirteen lengths of early speed.
  const splits = runs
    .filter((r) => r.benchmark)
    .map((r) => { const sp = splitOf(r.benchmark!); return { tempo: sp.tempo, ...sectionPoints(sp, r.distance, race.distance, goingBand(r.going)) }; });

  const section = (pick: (s: { early?: number; mid?: number; late?: number }) => number | undefined) => {
    const ps = splits.map(pick).filter((d): d is number => d !== undefined);
    return ps.length ? cls + mean(ps) : cls;
  };

  // A condition's rating (tempo, going, distance, track) is the mean of the
  // runs under that condition, shrunk toward a baseline, and its factor is
  // the gap to Class. Class is 40% peak, so against Class every plain mean
  // sits low for a horse with one standout run, and every factor reads
  // negative: Gambler, Sunshine Coast R6 20 Sep 2026, class 88 off runs
  // worth 92, 87, 87, 83 and 71, and tempo, going, distance and sections
  // together took 7.4 off it for conditions it had met in every one of
  // those runs; it was laid at $3.60 and won. With CATEGORY_BASE weighted
  // the condition is judged against the horse's own recency-weighted
  // average, so a horse that runs to its average under today's conditions
  // carries no factor, and only a real difference under them moves it.
  const base = CATEGORY_BASE === "weighted" ? weighted : cls;
  const subset = (keep: (r: PastEvent) => boolean) => {
    const ps = runs.filter(keep).map((r) => runPoints(r, race.classPoints, e.horse.age, race.date));
    const shrunk = (ps.reduce((a, b) => a + b, 0) + base * SHRINK) / (ps.length + SHRINK);
    return cls + (shrunk - base);
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
    trust: trustOf(runs, e.daysSinceLastRace),
  };
}

/** The distances of the runs the rating is built on. */
const runDistances = (e: RaceEntry, asOf?: number) => recentRuns(e, asOf).map((r) => r.distance).filter((d): d is number => typeof d === "number" && d > 0);

const sameTrack = (a?: string, b?: string) =>
  Boolean(a && b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();

/** Hurdles and steeplechases are rated on their own scale and never count. */
/**
 * A run that says nothing about form at a normal trip and stays out of the
 * ratings: a jumps race by name, anything past 3400m (the Jericho Cup is
 * flat, 4600m, once a year, and its benchmark read sixty lengths clear of a
 * BM90 par), or a benchmark that far from par however it happened. Tempest
 * Moon, Ballarat R5, 18 Sep 2026: that one run rated 99 and put a 74 horse
 * on top of a 2000m field.
 */
export const isJumps = (p: { raceName?: string; distance?: number; benchmark?: { vsClass: number } }) =>
  /\b(stpl|steeple|steeplechase|hdle|hurdle|jumps?)\b/i.test(p.raceName ?? "") || (p.distance ?? 0) > 3400 || Math.abs(p.benchmark?.vsClass ?? 0) > 25;

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
  // The race's measured strength when the feed has it, else the name mapped
  // onto that scale. A rating of nought is a race never rated (a Leeton
  // maiden came through as 0 and put a run at -7.9), so anything under
  // RR_FLOOR is treated as missing.
  // A race rating built from a hand-held overall time alone (a bush track with
  // no sectionals) can read like a Group race: Goondiwindi's BM50 of 5 Sep 2026
  // was rated 96, above a city BM72, and two horses beaten 2 and 11 lengths in
  // it were top rated at $12 and $14 a fortnight later. RR_TIME_ONLY 0 leaves
  // such a rating out and falls back to the name.
  const rrRaw = r.benchmark?.raceRating;
  const rr = rrRaw !== undefined && r.benchmark?.dataStage === "OVERALL_TIME_ONLY" && RR_TIME_ONLY === 0 ? undefined : rrRaw;
  // The feed's rating is capped within reach of today's par the same way a
  // name is, and with RR_OHR_CAP within reach of the horse's official rating
  // at the time too: the name's cap (OHR_REACH) never applied to the feed's
  // rating, so a 47-rated horse ran in a "96" race.
  const rrCapped = rr !== undefined
    ? Math.min(rr, toFeedScale(todayPar + RR_REACH), RR_OHR_CAP && ohr !== undefined ? toFeedScale(ohr + OHR_REACH) : Infinity)
    : undefined;
  // FLAT_PAR: every run starts from today's par, whatever race it was in, so
  // the run's worth is the clock alone and a time is a time. For sweeping.
  const parRaw = FLAT_PAR ? toFeedScale(todayPar) : RR_PAR ? (rrCapped !== undefined && rrCapped >= RR_FLOOR ? rrCapped : toFeedScale(named)) : named;
  // RR_SHRINK keeps that share of the run's par's distance from today's par: 1 all of it, 0 none (flat). For sweeping.
  const par = RR_SHRINK === 1 ? parRaw : toFeedScale(todayPar) + RR_SHRINK * (parRaw - toFeedScale(todayPar));
  // Overall time with no sectionals is a hand-held clock at a bush track, so
  // its lengths against class count for half.
  const trust = r.benchmark?.dataStage === "OVERALL_TIME_ONLY" ? TIME_ONLY_WEIGHT : 1;
  const byMargin = par - Math.min(15, (r.margin ?? ((r.finishPosition ?? 6) - 1) * 1.2) * POINTS_PER_LENGTH * MARGIN_WEIGHT);
  const own = OWN_CLOCK_BLEND > 0 || OWN_CLOCK_ALONE > 0 ? ownClock(r) : undefined;
  // A crawl then a sprint: the overall clock says little about the winner
  // and the closing sectional says a lot, so where the last 600 beats the
  // overall figure the run moves that way by SPRINT_RESCUE of the gap.
  const closing = r.benchmark?.sections?.["6-F"]?.vsClass;
  const vsClass = r.benchmark ? (SPRINT_RESCUE > 0 && closing !== undefined && closing > r.benchmark.vsClass ? r.benchmark.vsClass + SPRINT_RESCUE * (closing - r.benchmark.vsClass) : r.benchmark.vsClass) : 0;
  // With the feed's rating as the par, the race's speed is already in the
  // par, so the run is the race's strength less the lengths behind the
  // winner, not plus the horse's lengths against a benchmark the rating
  // was built from. Platinum Shot, Ascot 11 Apr 2026: last of eight, beaten
  // 4.4 lengths at $31 in a fast Open, and the double count had the run at
  // 93.3, above the Open's par. Sweep with scripts/sweep-caps.ts.
  const usedRr = RR_PAR && rrCapped !== undefined && rrCapped >= RR_FLOOR;
  const raw = usedRr && RR_MARGIN > 0 && r.margin !== undefined
    ? par - Math.min(15, r.margin * clockPoints(r.distance) * RR_MARGIN)
    : r.benchmark
    ? Math.max(par + (own !== undefined ? (1 - OWN_CLOCK_BLEND) * vsClass + OWN_CLOCK_BLEND * own : vsClass) * clockPoints(r.distance) * trust, byMargin - CLOCK_FLOOR * POINTS_PER_LENGTH)
    : own !== undefined && OWN_CLOCK_ALONE > 0
      ? par + own * clockPoints(r.distance) * OWN_CLOCK_ALONE
      : byMargin;
  // A beaten horse in a race the feed has rated cannot have run above that race by more than the cap.
  const beatenCap = usedRr && (r.finishPosition ?? 1) > 1 ? par + RR_BEATEN_CAP : Infinity;
  // Nor may the clock sit more than CLOCK_CEILING lengths above what the beaten margin says, at full weight.
  const marginFull = r.margin !== undefined ? par - r.margin * clockPoints(r.distance) : Infinity;
  // The clock's forgiveness fades with the margin when CEILING_FADE is finite: full at a narrow defeat, none at CEILING_FADE lengths.
  const forgive = Number.isFinite(CEILING_FADE) && r.margin !== undefined ? CLOCK_CEILING * Math.max(0, 1 - r.margin / CEILING_FADE) : CLOCK_CEILING;
  const clockCeiling = r.benchmark && Number.isFinite(CLOCK_CEILING) ? marginFull + forgive * clockPoints(r.distance) : Infinity;
  const capped = Math.min(raw, beatenCap, clockCeiling);
  // Part of the run's worth from the margin itself, where we have one.
  const blended = MARGIN_BLEND > 0 && Number.isFinite(marginFull) ? capped + MARGIN_BLEND * (marginFull - capped) : capped;
  return clamp(blended, par - 25, par + (juvenile ? 8 : 15));
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
/**
 * The ground's mark on a section, lengths against class over the cache
 * (scripts/out/section-bias.ts): on heavy the early section runs 1.5
 * lengths better than on good and the last 600 a length worse, soft is
 * within a fifth of good. 1 takes the ground's mark off before the section
 * counts, so wet-track sectionals read as they would on good. Off: neutral
 * over a cache that is mostly dry Saturdays (0.3100 v 0.3099); try again
 * with a wet winter in the cache.
 */
const SECTION_GOING = Number(process.env.OVERLAY_SECTION_GOING ?? 0) === 1;
const GOING_MARK: Record<GoingBand, { early: number; mid: number; late: number }> = {
  good: { early: 0, mid: 0, late: 0 },
  soft: { early: 0.2, mid: -0.1, late: 0.1 },
  heavy: { early: 1.5, mid: -0.4, late: -1.0 },
};

const bandOf = (distance: number) => SECTION_BANDS.find((b) => distance < b.to) ?? SECTION_BANDS[SECTION_BANDS.length - 1];

/**
 * A run's sections as points, ready to add to class: what that section is
 * worth in today's race. The run's figure is read as a standing among runs
 * over its own trip, then expressed over today's trip (mode 3) or the
 * sprint's (mode 2), so a slow first 1200m in an Oaks is an ordinary early
 * section for a 2400m race and not eleven points of missing speed.
 */
export function sectionPoints(split: Split, distance: number, today = distance, going?: GoingBand): { early?: number; mid?: number; late?: number } {
  const band = bandOf(distance);
  const target = SECTION_NORM === 3 ? bandOf(today) : SECTION_BANDS[0];
  const per = clockPoints(distance);
  const mark = SECTION_GOING && going ? GOING_MARK[going] : undefined;
  const one = (raw: number | undefined, key: "early" | "mid" | "late") => {
    if (raw === undefined) return undefined;
    const v = mark ? raw - mark[key] : raw;
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
  seed = "",
  last?: LastShape,
): string {
  // Each clause picks from its bank by the horse's name, so a card reads varied
  // but a rebuild never changes a runner's line.
  const say = (bank: string[], slot: string) => bank[hash(`${seed}|${slot}`) % bank.length];

  const place = ordinal(rank);
  const lead = say(
    rank === 1
      ? [
          `Rates top of the field at ${r.today}`, `Our top rated at ${r.today}`, `Best in the race on our numbers at ${r.today}`, `Heads our ratings at ${r.today}`,
          `The one to beat on our numbers at ${r.today}`, `Tops the field at ${r.today}`, `Our number one at ${r.today}`, `Sets the standard here at ${r.today}`,
        ]
      : [
          `Rates ${place} at ${r.today}`, `${cap(place)} on our numbers at ${r.today}`, `Sits ${place} in our ratings at ${r.today}`, `Comes out ${place} at ${r.today}`,
          `${cap(place)} best in the field at ${r.today}`, `Ranks ${place} for us at ${r.today}`, `Our ${place} pick at ${r.today}`, `${cap(place)} in the ratings at ${r.today}`,
        ],
    "lead",
  );

  const edges: [number, string[]][] = [
    [r.late - r.class, [
      "with the best closing sectionals", "with the sharpest last 600 in its form", "with a finish that stands out", "with the closing speed to win it",
      "with a big kick at the end", "with late speed the others lack", "with the strongest finish in its form", "with a sprint home that sets it apart",
    ]],
    [r.early - r.class, [
      "with the early speed to control it", "with the gate speed to take up a spot", "with the jump to dictate", "with speed to burn early",
      "with the early zip to pick its spot", "with the best early speed in its form", "with enough early pace to get its own way", "with the speed to be first to settle",
    ]],
    [r.going[race.going] - r.class, [
      `and goes better on ${race.going} ground`, `and lifts on ${race.going} ground`, `and ${race.going} ground brings out its best`, `and its ${race.going} form is its best`,
      `and gets the ${race.going} track it wants`, `and races at its best on a ${race.going} surface`, `and the ${race.going} going suits`, `and its record on ${race.going} ground is better`,
    ]],
    [race.tempo === "fast" ? r.pressure - r.class : -99, [
      "and holds on under a hot tempo", "and has stood up to pressure before", "and keeps going when they run hard", "and its best form is in fast-run races",
      "and does not mind a hard-run race", "and lasts out a strong pace", "and thrives when there is speed on", "and handles a genuine tempo",
    ]],
    [race.tempo === "slow" ? r.tempo.slow - r.class : -99, [
      "and finishes off a slow tempo", "and can sprint off a crawl", "and its best is in slowly run races", "and quickens when they dawdle",
      "and has a turn of foot off a soft pace", "and is at its best when they go steady", "and sprints well in a sit-and-kick race", "and likes a race run on the slow side",
    ]],
  ];
  const [gap, phrases] = edges.sort((a, b) => b[0] - a[0])[0];
  const strength = gap >= 1.5 ? ` ${say(phrases, "edge")}` : "";

  // Where it maps, read against the tempo: a hot race tests the leaders and
  // suits the closers, a crawl hands it to the front and leaves the back needing luck.
  const closer = r.late - r.class >= 1.5;
  const maps: Record<MapPosition, Record<Tempo, string[]>> = {
    leader: {
      fast: [
        "maps to lead but will be tested", "has to lead and hold them off", "goes forward into a hot tempo", "leads with pressure on it",
        "leads but will not get it easy", "has to find the front with others keen", "will be doing it tough in front", "leads into a race with plenty of speed",
      ],
      slow: [
        "maps to lead a soft pace", "should lead on its own terms", "can steal it from the front", "gets to dictate a crawl",
        "should get an easy time in front", "can control it from the lead", "looks the lone leader in a slow race", "gets a soft lead to work with",
      ],
      even: [
        "maps to lead", "should find the front", "looks the likely leader", "can roll forward and dictate",
        "should be in front early", "looks to set the pace", "maps to lead at a fair tempo", "should be the one they chase",
      ],
    },
    "on pace": {
      fast: [
        "sits close to a hot pace", "has to handle the pressure just off the lead", "gets a handy run in a hard-run race", "is right in the firing line",
        "sits up near a strong speed", "has to cope with the pace from a handy spot", "is close to the speed in a hot race", "settles handy with plenty of pressure on",
      ],
      slow: [
        "sits handy off a slow pace", "is well placed if they crawl", "gets the right spot in a slow race", "is close enough when they dawdle",
        "gets the ideal run if they go steady", "sits right where you want it off a slow pace", "is handy in a race that suits the handy ones", "gets the perfect spot for a sprint home",
      ],
      even: [
        "gets an on-pace run", "sits handy", "settles just off the lead", "gets a good spot near the speed",
        "should get the run of the race", "sits second or third", "gets a nice run behind the leader", "is handy without doing the work",
      ],
    },
    midfield: {
      fast: [
        "sits midfield with the pace ahead of it", "gets a midfield run while the leaders go hard", "is placed to pounce if the leaders tire", "gets cover in the middle of a hot race",
        "sits off a hot pace in midfield", "is well out of the speed battle", "gets the run of the race from midfield", "is placed to run on at the tired ones",
      ],
      slow: [
        "needs to be closer than midfield off a slow tempo", "gets back midfield in a slow race", "has to go early from midfield", "is further back than it wants in a crawl",
        "needs the jockey to push forward in a slow race", "sits midfield in a race that suits the leaders", "has to make its move early off a slow pace", "is a touch far back for a slow race",
      ],
      even: [
        "settles midfield", "gets a run in the pack", "has cover in midfield", "sits in the middle of the field",
        "gets a midfield run with cover", "should get a sit in the pack", "settles in the middle with options", "gets a nice run in midfield",
      ],
    },
    back: {
      fast: [
        "gets the pace to run at from the back", "has the hot tempo to set it up from the back", "comes from the back with speed on up front", "gets the race run to suit from the back",
        "should get a strong pace to chase", "gets the tempo it needs from the rear", "has the leaders to run down late", "gets a race set up for the closers",
      ],
      slow: [
        "needs luck from the back off a slow tempo", "is left plenty to do from the back in a slow race", "gets back and needs them to run", "has a lot to do if they crawl",
        "gets back in a race that will not suit", "needs the pace to lift from the rear", "is up against it from the back in a slow race", "needs a big finish from the rear off a soft pace",
      ],
      even: closer
        ? [
            "runs on from the back", "finishes off from the back", "comes late from the rear", "hits the line hard from the back",
            "gets back and runs home", "swoops late from the rear", "finishes strongly from the back", "comes with a late run from the back",
          ]
        : [
            "settles back in the field", "gets back and needs a gap", "has ground to make up from the back", "needs luck from the back",
            "settles near the tail", "has work to do from the rear", "needs clear running from the back", "gets back and needs things to go right",
          ],
    },
  };
  // Last start's shape comes in only when it tells us something: the race
  // turns for or against the horse, or (some of the time) the same help or
  // hindrance comes round again.
  const was = last ? lastStartClause(last, r.map, race.tempo, say) : undefined;
  const map = `, ${was ?? say(maps[r.map][race.tempo], "map")}`;

  const tail =
    signal === "back"
      ? `, ${say([
          "and the market is longer than our price", "and the price is bigger than it should be", "and it is paying more than it should", "and the market has it too long",
          "and the market is underrating it", "and there is value in the price", "and the odds are better than its chance", "and we have it shorter than the market",
        ], "tail")}.`
      : signal === "lay"
        ? `, ${say([
            "but the market has it too short", "but it is shorter than it should be", "but the price is too skinny", "but the market has overdone it",
            "but the market is overrating it", "but there is no value at the price", "but its chance is not as good as the odds say", "but we have it longer than the market",
          ], "tail")}.`
        : ".";

  return `${lead}${strength}${map}${tail}`;
}

/** Where a horse settled at its last start and how that race was run. */
export interface LastShape {
  map: MapPosition;
  tempo: Tempo;
}

/** The shape of the horse's last start, when the form has both halves of it. */
export function lastShapeOf(e: RaceEntry): LastShape | undefined {
  const p = (e.pastEvents ?? [])
    .filter((x) => x.race !== false && !x.trial && !x.spell && !x.scratched && !isJumps(x))
    .sort((a, b) => b.date - a.date)[0];
  const tempo = p?.benchmark ? splitOf(p.benchmark).tempo : undefined;
  if (!p?.posSettling || !p.numRunners || p.numRunners < 2 || !tempo) return undefined;
  return { map: mapOf(p.posSettling, p.numRunners), tempo };
}

/** How a spot suits a tempo: a hot race helps the ones behind, a crawl the ones in front. */
function shapeSuit(map: MapPosition, tempo: Tempo): number {
  if (tempo === "even") return 0;
  const front = map === "leader" || map === "on pace";
  return (tempo === "fast") === front ? -1 : 1;
}

/** Last start's shape against today's and what the change means, or nothing when it is not worth saying. */
function lastStartClause(last: LastShape, map: MapPosition, tempo: Tempo, say: (bank: string[], slot: string) => string): string | undefined {
  const spot = { leader: "led", "on pace": "sat handy", midfield: "settled midfield", back: "got back" }[last.map];
  const pace = { fast: "in a hot race", slow: "in a slow race", even: "at an even tempo" }[last.tempo];
  const before = shapeSuit(last.map, last.tempo);
  const now = shapeSuit(map, tempo);
  // Always when the race flips from against it to for it (or back), a third
  // of the time for a smaller change, a fifth for the same help again.
  const odds = Math.abs(now - before) === 2 ? 1 : now !== before ? 1 / 3 : now !== 0 ? 1 / 5 : 0;
  const roll = Number(say(Array.from({ length: 60 }, (_, i) => String(i)), "mention")) / 60;
  if (roll >= odds) return undefined;
  const then =
    now > before
      ? ["but gets a better setup today", "but today's race should suit far better", "and the shape turns its way today", "but gets the race it needs today", "but the map is kinder this time", "and gets it run its way this time"]
      : now < before
        ? ["but will not get that help today", "and the shape is against it this time", "but today's race will not suit as well", "and has it tougher today", "and gets no such help today", "but the map turns on it today"]
        : now > 0
          ? ["and gets the same setup today", "and the race should be run its way again", "and gets that help again today", "and the shape suits again"]
          : ["and has it against it again today", "and faces the same problem today", "and the shape is no kinder today", "and has the same setup to overcome"];
  return `${spot} ${pace} last start ${say(then, "then")}`;
}

/** One line from a bank, picked by the seed so a rebuild keeps it. */
export const pickLine = (bank: string[], seed: string) => bank[hash(seed) % bank.length];

/** A stable small hash of a string, for picking phrasing. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  // Mix the high bits down, since a small modulus only reads the low ones.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One sentence on what decides the race. */
export function verdict(
  top: { horseName: string; ratings: RunnerRatings }[],
  tempo: Tempo,
): string {
  if (top.length < 2) return "Too little form to call.";
  const [a, b] = top;
  const closer = [...top].sort((x, y) => y.ratings.late - x.ratings.late)[0];
  const rival = closer.horseName === a.horseName ? b : closer;
  const pick = (bank: string[]) => bank[hash(`${a.horseName}|${b.horseName}`) % bank.length];
  const [A, B, R] = [a.horseName, b.horseName, rival.horseName];
  if (tempo === "fast") {
    return pick([
      `Whether ${A} settles close enough to hold off ${R} once the fast pace bites.`,
      `A hot tempo, so can ${A} last long enough to beat ${R} home?`,
      `The pace is on, and ${R} is the one coming if ${A} gets caught up in it.`,
      `How much the speed takes out of ${A}, with ${R} waiting to pounce.`,
      `A strong pace should test ${A}, and ${R} is best placed to take advantage.`,
      `If the speed holds up, ${R} gets its chance to run down ${A}.`,
      `${A} is the best horse, but a hot tempo gives ${R} a real shot.`,
      `A genuine pace, so it is ${A}'s class against ${R}'s finish.`,
    ]);
  }
  if (tempo === "slow") {
    return pick([
      `Whether ${R} gets into it early enough to run down ${A} off a slow tempo.`,
      `A slow pace hurts ${R}, which has to be ridden closer to beat ${A}.`,
      `If they crawl, ${R} has too much to do to catch ${A}.`,
      `${R} needs a truer pace than it is likely to get to reel in ${A}.`,
      `A sit-and-kick race, and ${A} is the one we trust to kick best.`,
      `A slow tempo, so ${R} needs a smart ride to beat ${A}.`,
      `Little pace on, so it favours ${A} over the late run of ${R}.`,
      `${R} is the danger to ${A}, but not if they go steady.`,
    ]);
  }
  return pick([
    `${A} against ${B} at level terms, with nothing in the map to tip it.`,
    `${A} and ${B} look the pair, and the map does not split them.`,
    `A fair pace, so it comes down to ${A} or ${B} on ability.`,
    `No map edge either way, so ${A} gets the nod over ${B} on the numbers.`,
    `An even tempo, so the better horse should win, and we think that is ${A}.`,
    `${A} is our pick, with ${B} the one to beat it at a fair pace.`,
    `Nothing in the pace to help anyone, so ${A} over ${B} on ratings.`,
    `A straight contest between ${A} and ${B}, and the numbers lean to ${A}.`,
  ]);
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
