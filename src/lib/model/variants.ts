import variants from "./day-variants.json";

/**
 * How fast the track was running on the day, in lengths against the class
 * benchmark, from the other races at the same meeting and distance band
 * (scripts/export-day-variants.ts). Devonport's sprints on 9 Sep 2026 all ran
 * about three lengths quick; the rating read Thickskinned's run there as a
 * career best, 92.6, and it was Prime at $2.30 and ran third.
 *
 * The run's own race is left out, so a strong race is not cancelled against
 * itself. With fewer than two other races in the band the whole meeting is
 * used, and the figure is pulled toward nothing by the count it rests on.
 */
const TABLE = variants as Record<string, Record<string, number>>;

/** How many races' worth of zero the median is pulled toward. */
const BAND_PULL = 1;
const DAY_PULL = 3;

export const distanceBand = (distance: number) => (distance < 1300 ? "sprint" : distance <= 1800 ? "mid" : "stay");

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Lengths the track ran quick (+) or slow (-) for this run, 0 where we cannot say. */
export function dayVariant(run: { track?: string; date?: number; distance?: number; raceId?: string }): number {
  if (!run.track || !run.date || !run.distance) return 0;
  const day = new Date(run.date).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const at = `${run.track.toLowerCase()}|${day}|`;
  const others = (band: string) => Object.entries(TABLE[at + band] ?? {}).filter(([id]) => id !== run.raceId).map(([, v]) => v);
  const band = others(distanceBand(run.distance));
  if (band.length >= 2) return median(band) * (band.length / (band.length + BAND_PULL));
  const day_ = ["sprint", "mid", "stay"].flatMap(others);
  return day_.length ? median(day_) * (day_.length / (day_.length + DAY_PULL)) : 0;
}
