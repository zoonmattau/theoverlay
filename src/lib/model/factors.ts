/**
 * The smaller projection factors: weight, freshness. Each returns points to
 * add to Class on the way to Today, and each is capped so no single input
 * can swamp the sectional work.
 */

import type { RaceEntry } from "@/lib/formking/types";

const CAP = { weight: 3, fresh: 3 };
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

/** "4:1-0-2" is starts:wins-seconds-thirds. */
export function parseRecord(s?: string) {
  const m = s?.match(/^(\d+):(\d+)-(\d+)-(\d+)$/);
  if (!m) return undefined;
  return { starts: Number(m[1]), wins: Number(m[2]), seconds: Number(m[3]), thirds: Number(m[4]) };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
