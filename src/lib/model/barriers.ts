import table from "./barriers.json";
import { trackKey } from "@/lib/data/people";

/**
 * The gate's own effect, from the Datahub's runs (scripts/build-barriers.ts):
 * how horses drawn inside, middle and wide at each track and trip have run
 * against the rest of their field, in lengths, over 205,000 runs to 10 Sep
 * 2026. A gate is drawn at random, so the mean says what the gate does, free
 * of the horse. Across every track the inside third runs 0.26 lengths better
 * than the field and the outside third 0.30 worse, at every trip; tracks
 * differ (Ballarat's wide gate costs 0.7 in a sprint, Pinjarra's helps).
 */
const TABLE = table as { band: Record<string, number>; cells: Record<string, { effect: number; runs: number }> };

export const BANDS = [1150, 1350, 1650, 2050, Infinity];
export const bandOf = (distance: number) => BANDS.findIndex((b) => distance < b);
/** Gate position among the field once scratchings are out: 0 inside third, 1 middle, 2 outside third. */
export const positionOf = (gate: number, field: number) => (field <= 1 ? 1 : Math.min(2, Math.floor(((gate - 1) / field) * 3)));

/** Lengths the gate is worth against the field, positive good; the trip band's figure where the track has no cell. */
export function barrierEffect(track: string | undefined, distance: number, gate: number, field: number): number {
  const band = bandOf(distance);
  const pos = positionOf(gate, field);
  const key = track ? trackKey(track) : null;
  const cell = key ? TABLE.cells[`${key}|${band}|${pos}`] : undefined;
  return cell?.effect ?? TABLE.band[`${band}|${pos}`] ?? 0;
}
