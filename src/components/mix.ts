import type { CSSProperties } from "react";
import type { RaceMix, RaceTip } from "@/lib/model/types";

/**
 * The stripes for a race with more than one kind of call: the board's
 * colours side by side, each as wide as its share of the calls, so a race
 * with a bet and a lay is half blue and half red. One kind of call is
 * painted by its tip-* class as before and gets no style here.
 */

const COLOUR: Record<RaceTip, string> = {
  prime: "var(--color-lime)",
  back: "var(--color-blue)",
  roughie: "var(--color-blue-soft)",
  lay: "var(--color-red)",
};

export const mixed = (mix: RaceMix) => mix.length > 1;

export function mixGradient(mix: RaceMix): string {
  const total = mix.reduce((a, s) => a + s.n, 0);
  let at = 0;
  // The last stripe runs to the edge with no end stop, and the gradient never
  // repeats, so no sliver of the first colour tiles in at the far right.
  const stops = mix.map((s, i) => {
    const from = at;
    at += (s.n / total) * 100;
    return i === mix.length - 1 ? `${COLOUR[s.tip]} ${from.toFixed(1)}%` : `${COLOUR[s.tip]} ${from.toFixed(1)}% ${at.toFixed(1)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")}) no-repeat`;
}

/** The fill for a race still to run, or the outline for one that has: the stripes as a border, the grey fill kept inside it. */
export function mixStyle(mix: RaceMix, resulted = false): CSSProperties | undefined {
  if (!mixed(mix)) return undefined;
  const stripes = mixGradient(mix);
  if (resulted) return { border: "2px solid transparent", background: `linear-gradient(var(--color-surface), var(--color-surface)) padding-box no-repeat, ${stripes} border-box` };
  return { background: stripes, borderColor: "transparent" };
}

/** The classes that go with the style: tip-mix for the text colours, has-prime when a lime stripe wants ink on it. */
export const mixClass = (mix: RaceMix) => (mixed(mix) ? `tip-mix ${mix.some((s) => s.tip === "prime" || s.tip === "roughie") ? "has-pale" : ""}` : "");

/** "Prime, 2 bets, 1 lay". */
export function mixTag(mix: RaceMix): string | undefined {
  if (mix.length === 0) return undefined;
  const word = (s: RaceMix[number]) => (s.tip === "prime" ? (s.n === 1 ? "Prime" : `${s.n} Primes`) : s.tip === "roughie" ? (s.n === 1 ? "Way Overlay" : `${s.n} Way Overlays`) : `${s.n} ${s.tip === "lay" ? "lay" : "bet"}${s.n === 1 ? "" : "s"}`);
  return mix.map(word).join(", ");
}
