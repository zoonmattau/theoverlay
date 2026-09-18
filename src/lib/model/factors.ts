/**
 * The smaller projection factors: weight, freshness. Each returns points to
 * add to Class on the way to Today, and each is capped so no single input
 * can swamp the sectional work.
 */

import type { RaceEntry } from "@/lib/formking/types";
import type { MapPosition } from "./types";

const CAP = { weight: 3, fresh: 3, barrier: 1.5 };
/** Form King's restated ratings move a lot per kilo, so take half the shift: more made the form price worse over the cache (scripts/sweep-streak.ts, 18 Sep 2026). */
const WEIGHT_SCALE = Number(process.env.OVERLAY_WEIGHT_SCALE ?? 0.5);
const SHRINK = 2;

/**
 * Weight today against the weight in past runs. Form King restates each
 * run's rating at today's weight, so the mean shift is the adjustment.
 */
export function weightFactor(e: RaceEntry): number {
  const shifts = (e.pastEvents ?? [])
    .filter(
      (p) =>
        p.race !== false && p.adjustedForTodaysWeight !== undefined && p.weightForAgeRating !== undefined,
    )
    .slice(0, 5)
    .map((p) => p.adjustedForTodaysWeight! - p.weightForAgeRating!);
  if (shifts.length) return clamp(mean(shifts) * WEIGHT_SCALE, -CAP.weight, CAP.weight);
  // No restated ratings: fall back to the kilos, at half a point a kilo.
  const last = (e.pastEvents ?? []).find((p) => p.race !== false && p.weight);
  const today = e.weightCarried ?? e.weight;
  if (!last?.weight || !today) return 0;
  return clamp((last.weight - today) * 0.5, -CAP.weight, CAP.weight);
}

/**
 * Where the horse is in its preparation, and what that has meant before.
 * First up it is rated on its past first-up runs; deeper in, on its past
 * runs at the same stage, so a horse that peaks third up gets that and one
 * that tails off late in a campaign loses it. A poor first-up or second-up
 * record costs a point, and a horse six or more runs in with nothing to
 * say it holds its form is docked half a point.
 */
export function freshFactor(e: RaceEntry, cls: number, runPoints: (p: NonNullable<RaceEntry["pastEvents"]>[number]) => number): number {
  const stage = prepStage(e);
  const firstUp = stage === 1;
  if (stage === 0) return 0;

  let out = 0;
  const past = (e.pastEvents ?? []).filter((p) => p.race !== false);
  const same = firstUp ? past.filter((p) => (p.daysSincePreviousRace ?? 0) >= 80) : past.filter((p) => p.raceInPrep === stage);
  if (same.length) {
    const ps = same.slice(0, 3).map(runPoints);
    const at = (ps.reduce((a, b) => a + b, 0) + cls * SHRINK) / (ps.length + SHRINK);
    out += 0.5 * (at - cls);
  } else if (stage >= 6) {
    out -= 0.5;
  }
  if (stage <= 2) {
    const record = parseRecord(firstUp ? e.form?.firstUpForm : e.form?.secondUpForm);
    if (record && record.starts >= 3) {
      const placeRate = (record.wins + record.seconds + record.thirds) / record.starts;
      out += placeRate >= 0.5 ? 0.5 : placeRate < 0.2 ? -1 : 0;
    }
  }
  return clamp(out, -CAP.fresh, CAP.fresh);
}

/**
 * A layoff of a year or more. Over the resulted races in the cache, horses
 * off 365 days or more won a fifth as often as their form price said, where
 * 180 to 365 days was on the money, so the penalty ramps in from 300 days to
 * its full size at 450. Sweepable from the env for scripts/sweep-layoff.ts.
 */
const LAYOFF_POINTS = Number(process.env.OVERLAY_LAYOFF_POINTS ?? 10);
const LAYOFF_FROM = 300;
const LAYOFF_FULL = 450;

export function layoffFactor(e: RaceEntry): number {
  const days = e.daysSinceLastRace ?? 0;
  if (days <= LAYOFF_FROM) return 0;
  return -LAYOFF_POINTS * clamp((days - LAYOFF_FROM) / (LAYOFF_FULL - LAYOFF_FROM), 0, 1);
}

/**
 * No run near today's distance. The distance category shrinks to Class
 * when nothing is within 200m, which read as neutral; over the cache such
 * horses won about three quarters as often as their form price said, and
 * worse the further today's trip sits from anything they have done. Points
 * per 100m beyond the 200m band, capped. Sweepable from the env.
 */
const DISTANCE_GAP_RATE = Number(process.env.OVERLAY_DISTANCE_GAP_RATE ?? 1.5);
const DISTANCE_GAP_CAP = 5;

export function distanceGapFactor(runDistances: number[], distance: number): number {
  if (runDistances.length === 0) return 0;
  const nearest = Math.min(...runDistances.map((d) => Math.abs(d - distance)));
  if (nearest <= 200) return 0;
  return -Math.min(DISTANCE_GAP_CAP, (DISTANCE_GAP_RATE * (nearest - 200)) / 100);
}

/** Which run of the preparation this is: 1 first up, 2 second up and so on, 0 when unknown. */
export function prepStage(e: RaceEntry): number {
  const days = e.daysSinceLastRace ?? 0;
  if (days >= 80) return 1;
  return e.raceInPrep ?? 0;
}

/**
 * The draw, read with where the horse settles. A leader or on-pace runner
 * pays for a wide gate because it has to work early to hold its spot, and
 * gains from an inside one; a midfield or back runner cares less, though a
 * very wide gate still costs cover and an inside gate in a big field can
 * mean being held up. Sprints punish the wide gate most, staying races
 * hardly at all, and small fields halve the lot. `gate` is the runner's
 * place from the rail once scratchings are out, 1 the innermost.
 */
export function barrierFactor(gate: number, field: number, map: MapPosition, distance: number): number {
  if (field < 4 || gate < 1) return 0;
  // 0 is the rail, 1 the widest gate.
  const g = (Math.min(gate, field) - 1) / Math.max(1, field - 1);
  const w = distance <= 1200 ? 1 : distance <= 1600 ? 0.7 : distance <= 2000 ? 0.45 : 0.3;
  const front = map === "leader" || map === "on pace";
  let out = 0;
  if (front) {
    if (g > 0.45) out = -(g - 0.45) * 2.6 * w;
    else if (g < 0.3) out = (0.3 - g) * 1.6 * w;
  } else {
    if (g > 0.65) out = -(g - 0.65) * 1.6 * w;
    else if (g < 0.15 && field >= 12) out = -(0.15 - g) * 2 * w;
  }
  if (field < 8) out *= 0.5;
  return clamp(out, -CAP.barrier, CAP.barrier);
}

/** "4:1-0-2" is starts:wins-seconds-thirds. */
export function parseRecord(s?: string) {
  const m = s?.match(/^(\d+):(\d+)-(\d+)-(\d+)$/);
  if (!m) return undefined;
  return { starts: Number(m[1]), wins: Number(m[2]), seconds: Number(m[3]), thirds: Number(m[4]) };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
