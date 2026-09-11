import { price, signedPercent } from "@/lib/format";
import type { PublishedRace, PublishedRunner } from "./types";

/** Points above or below class that count as a real difference. */
const GAP = 1.5;

export type Tone = 1 | 0 | -1;

/**
 * How the expected tempo treats a runner, starting from where it settles:
 * a leader gets an easy time in a slow race and is tested in a fast one, a
 * backmarker the reverse, and its own record at that tempo only overrides
 * that when it is emphatic.
 */
export function tempoFit(r: PublishedRunner, race: PublishedRace): { tone: Tone; text: string } {
  const g = r.ratings;
  const tempo = race.pace.tempo;
  if (tempo === "even") return { tone: 0, text: "Even tempo, no edge either way" };
  const front = g.map === "leader" || g.map === "on pace";
  const prior: Tone = tempo === "slow" ? (front ? 1 : -1) : front ? -1 : 1;
  const record = (tempo === "fast" ? g.pressure : g.tempo.slow) - g.class;
  let tone: Tone = prior;
  if (prior > 0 && record <= -2 * GAP) tone = 0;
  if (prior < 0 && record >= 2 * GAP) tone = 0;
  const text =
    tone > 0
      ? tempo === "slow"
        ? front
          ? "Slow tempo suits, easy time up front"
          : "Slow tempo suits"
        : "Fast tempo suits, gets pulled into it"
      : tone < 0
        ? tempo === "slow"
          ? "Slow tempo against it, has to make ground"
          : "Fast tempo against it, gets tested up front"
        : `Neutral on the ${tempo} tempo`;
  return { tone, text };
}

/** How the runner finishes, from its late sectionals against its early ones. */
export function finishFit(r: PublishedRunner): { tone: Tone; text: string } {
  const g = r.ratings;
  const gap = g.late - (g.early + g.mid) / 2;
  const tone: Tone = gap >= GAP ? 1 : gap <= -GAP ? -1 : 0;
  return { tone, text: tone > 0 ? "Strong closer" : tone < 0 ? "Does its best work early" : "Runs the race out evenly" };
}

/** Where it settles, as the start of a sentence. */
export function settles(r: PublishedRunner): string {
  const m = r.ratings.map;
  return m === "leader" ? "Should lead" : m === "on pace" ? "Settles on the speed" : m === "midfield" ? "Settles midfield" : "Goes back";
}

/** The call in one sentence, always last, so the price is the point. */
export function callLine(r: PublishedRunner): string {
  const rated = price(r.ratedPrice);
  const live = price(r.marketPrice);
  if (!r.marketPrice) return `Rated ${rated}, no market price yet.`;
  if (r.signal === "back") return `${r.prime ? "Prime Overlay" : "Bet"}: ${live} in the market against our ${rated}, an edge of ${signedPercent(r.edge)}.`;
  if (r.signal === "lay") return `Lay: ${live} in the market is under our ${rated}.`;
  if (r.rank && r.rank <= 4) return `No bet: in our top four, but ${live} against our ${rated} is about right.`;
  return `No bet: ${live} against our ${rated}, no edge.`;
}

/** The what-to-watch sentence: position, tempo, finish, then the call. */
export function watchSentence(r: PublishedRunner, race: PublishedRace): string {
  const t = tempoFit(r, race);
  const f = finishFit(r);
  const tempoBit = t.tone > 0 ? ", the tempo is in its favour" : t.tone < 0 ? ", the tempo is against it" : "";
  const finishBit = f.tone > 0 ? " and it finishes off hard" : f.tone < 0 ? " and it needs to be there early because it does not finish off" : " and it runs the race out evenly";
  return `${settles(r)}${tempoBit}${finishBit}. ${callLine(r)}`;
}
