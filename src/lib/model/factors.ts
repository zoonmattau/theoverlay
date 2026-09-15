/**
 * The smaller projection factors: weight, freshness. Each returns points to
 * add to Class on the way to Today, and each is capped so no single input
 * can swamp the sectional work.
 */

import type { RaceEntry } from "@/lib/formking/types";
import type { MapPosition } from "./types";

const CAP = { weight: 3, fresh: 3, barrier: 1.5 };
/** Form King's restated ratings move a lot per kilo, so take half. */
const WEIGHT_SCALE = 0.5;
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
 * Fresh horses are rated on their past first-up runs rather than their last
 * run, and a poor first-up or second-up record costs a point.
 */
export function freshFactor(e: RaceEntry, cls: number, runPoints: (p: NonNullable<RaceEntry["pastEvents"]>[number]) => number): number {
  const days = e.daysSinceLastRace ?? 0;
  const firstUp = days >= 80 || e.raceInPrep === 1;
  const secondUp = !firstUp && e.raceInPrep === 2;
  if (!firstUp && !secondUp) return 0;

  let out = 0;
  if (firstUp) {
    const runs = (e.pastEvents ?? []).filter(
      (p) => p.race !== false && (p.daysSincePreviousRace ?? 0) >= 80,
    );
    if (runs.length) {
      const ps = runs.slice(0, 3).map(runPoints);
      const fresh = (ps.reduce((a, b) => a + b, 0) + cls * SHRINK) / (ps.length + SHRINK);
      out += 0.5 * (fresh - cls);
    }
  }
  const record = parseRecord(firstUp ? e.form?.firstUpForm : e.form?.secondUpForm);
  if (record && record.starts >= 3) {
    const placeRate = (record.wins + record.seconds + record.thirds) / record.starts;
    out += placeRate >= 0.5 ? 0.5 : placeRate < 0.2 ? -1 : 0;
  }
  return clamp(out, -CAP.fresh, CAP.fresh);
}

/**
 * The draw, read with where the horse settles. A leader or on-pace runner
 * pays for a wide gate because it has to work early to hold its spot, and
 * gains from an inside one; a midfield or back runner cares less, though a
 * very wide gate still costs cover and an inside gate in a big field can
 * mean being held up. Sprints punish the wide gate most, staying races
 * hardly at all, and small fields halve the lot.
 */
export function barrierFactor(barrier: number, field: number, map: MapPosition, distance: number): number {
  if (field < 4 || barrier < 1) return 0;
  // 0 is the rail, 1 the widest gate.
  const g = (Math.min(barrier, field) - 1) / Math.max(1, field - 1);
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
