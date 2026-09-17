import standards from "./standards.json";
import { goingBand } from "./ratings";

/**
 * Our own standard times, by track, distance and going: the typical time
 * from every run we hold (the Datahub's runs table, twenty runs or more),
 * written by scripts/export-standards.ts. A run's clock read against this is
 * ours, not the feed's class benchmark, and it knows the track and the ground.
 */
type Standard = { all: number; runs: number; good?: number; soft?: number; heavy?: number };
const TABLE = standards as Record<string, Standard>;

/** Milliseconds a length takes. */
const LENGTH_MS = 167;

/**
 * Lengths a run was quicker (+) or slower (-) than our standard for that
 * track, distance and going; the going's own standard where we have one,
 * else the track and distance overall. Undefined where we have no standard.
 */
export function ownClock(run: { track?: string; distance?: number; going?: string; timeInMillis?: number }): number | undefined {
  if (!run.track || !run.distance || !run.timeInMillis) return undefined;
  const s = TABLE[`${run.track.toLowerCase()}|${run.distance}`];
  if (!s) return undefined;
  const band = run.going ? goingBand(run.going) : undefined;
  const standard = (band && s[band]) || s.all;
  return Math.round(((standard - run.timeInMillis) / LENGTH_MS) * 10) / 10;
}
