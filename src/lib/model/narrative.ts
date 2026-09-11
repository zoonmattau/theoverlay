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
  const facts = observations(r, race).slice(0, 2).map((o) => o.text);
  const tempoBit = t.tone > 0 ? "the tempo is in its favour" : t.tone < 0 ? "the tempo is against it" : "";
  const finishBit = f.tone > 0 ? "it finishes off hard" : f.tone < 0 ? "it needs to be there early because it does not finish off" : "";
  const clauses = [...facts, tempoBit, finishBit].filter(Boolean);
  const body = clauses.length ? `, ${clauses.slice(0, -1).join(", ")}${clauses.length > 1 ? " and " : ""}${clauses[clauses.length - 1]}` : "";
  return `${settles(r)}${body}. ${callLine(r)}`;
}

interface Observation {
  /** Bigger is more worth saying. */
  weight: number;
  text: string;
}

/** Benchmark points from a class string like "Bm78", "Class 3" or "Mdn". */
function classNumber(name?: string): number | undefined {
  if (!name) return undefined;
  const bm = name.match(/(?:bm|benchmark)\s?(\d{2,3})/i);
  if (bm) return Number(bm[1]);
  if (/mdn|maiden/i.test(name)) return 52;
  const cl = name.match(/(?:cl|class)\s?(\d)/i);
  if (cl) return 52 + Number(cl[1]) * 6;
  if (/group\s?1|\bg1\b/i.test(name)) return 120;
  if (/group\s?2|\bg2\b/i.test(name)) return 112;
  if (/group\s?3|\bg3\b/i.test(name)) return 105;
  if (/listed/i.test(name)) return 100;
  return undefined;
}

/** Picks a phrasing for a runner so the column does not read as a template. */
const pick = (r: PublishedRunner, options: string[]) => options[(r.tabNumber + r.barrier) % options.length];

/**
 * Everything worth saying about a runner today, from the form guide and the
 * ratings, each with a weight so the sentence leads with what matters.
 */
export function observations(r: PublishedRunner, race: PublishedRace): Observation[] {
  const out: Observation[] = [];
  const g = r.ratings;
  const h = r.horse;
  const last = r.runs?.[0];
  const field = race.runners.filter((x) => !x.scratched).length;

  // Class move from the last start.
  const lastClass = classNumber(last?.className);
  if (lastClass !== undefined) {
    const move = lastClass - race.classPoints;
    if (move >= 6) out.push({ weight: 4, text: pick(r, [`drops in class from a ${last!.className}`, `comes back in grade from a ${last!.className}`, `eases in class off a ${last!.className}`]) });
    else if (move <= -6) out.push({ weight: 3, text: pick(r, [`steps up in class from a ${last!.className}`, `rises in grade off a ${last!.className}`]) });
  }

  // Last start.
  if (last?.finish === 1) out.push({ weight: 3, text: pick(r, ["won last start", "comes off a win", "is a last-start winner"]) });
  else if (last?.finish && last.finish <= 3) out.push({ weight: 2, text: pick(r, [`ran ${last.finish === 2 ? "second" : "third"} last start`, "placed last start"]) });
  else if (last?.margin !== undefined && last.margin >= 6) out.push({ weight: 2, text: pick(r, ["was well beaten last start", "has a poor last run to forgive"]) });

  // Rivals met last start.
  const rival = last?.met?.find((m) => m.finish !== undefined && last.finish !== undefined && last.finish < m.finish);
  if (rival) {
    const other = race.runners.find((x) => x.tabNumber === rival.tab);
    if (other && !other.scratched) out.push({ weight: 4, text: `beat ${other.horseName} last start` });
  }

  // Freshness.
  const days = h?.daysSinceLastRun;
  if (h?.firstStarter) out.push({ weight: 3, text: "is a first starter" });
  else if (days && days > 120) out.push({ weight: 3, text: `is first up after ${days} days` });
  else if (days && days > 60) out.push({ weight: 2, text: "resumes from a break" });
  else if (days && days <= 7) out.push({ weight: 2, text: `backs up after ${days} days` });

  // Weight against last start.
  if (last?.weight && r.weight) {
    const diff = r.weight - last.weight;
    if (diff <= -2) out.push({ weight: 2, text: `drops ${Math.abs(diff).toFixed(1)}kg` });
    else if (diff >= 2) out.push({ weight: 2, text: `goes up ${diff.toFixed(1)}kg` });
  }

  // Barrier against the run style.
  const front = g.map === "leader" || g.map === "on pace";
  if (front && r.barrier <= 3) out.push({ weight: 2, text: pick(r, ["draws to get the run of the race", "has the inside draw to hold its spot"]) });
  else if (front && field >= 10 && r.barrier >= field - 2) out.push({ weight: 2, text: "has to work early from the wide gate" });
  else if (!front && r.barrier >= field - 2) out.push({ weight: 1, text: "goes back from the wide draw" });

  // Conditions from the ratings.
  const goingGap = g.going[race.going] - g.class;
  if (goingGap >= 1.5) out.push({ weight: 2, text: pick(r, [`is better on ${race.going} ground than its class says`, `handles the ${race.going} track`]) });
  else if (goingGap <= -1.5) out.push({ weight: 2, text: `has not run to its class on ${race.going} ground` });
  const distGap = g.distance - g.class;
  if (distGap >= 1.5) out.push({ weight: 2, text: "is at its best at this trip" });
  else if (distGap <= -1.5) out.push({ weight: 2, text: "is a query at the trip" });
  if (g.track - g.class >= 1.5) out.push({ weight: 1, text: "goes well here" });

  // Market move since opening.
  if (r.marketOpen && r.marketPrice) {
    const move = r.marketPrice / r.marketOpen;
    if (move <= 0.8) out.push({ weight: 2, text: pick(r, ["is firming in the market", "has been backed"]) });
    else if (move >= 1.3) out.push({ weight: 2, text: pick(r, ["is drifting in the market", "has eased in betting"]) });
  }

  // Stable and rider.
  if ((g.factors.trainer ?? 0) >= 0.4) out.push({ weight: 1, text: "comes from an in-form stable" });
  if ((g.factors.jockey ?? 0) >= 0.4) out.push({ weight: 1, text: "has a top rider up" });

  return out.sort((a, b) => b.weight - a.weight);
}
