// For each market weight: how many bets the 3-point rule gives, their
// average price, their average edge and how they did, over every resulted
// race in the local cache. Then the same for Prime thresholds at one weight.
// OVERLAY_MARKET_WEIGHT is read once per process, so this runs the model
// itself for each weight through rateRace rather than the env.
// npx tsx --tsconfig tsconfig.json scripts/sweep-weights.ts
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { rateRace } from "../src/lib/model/rate";
import { classPoints, goingBand, rateEntries } from "../src/lib/model/ratings";

const files = readdirSync(".formking-cache").filter((f) => f.startsWith("race-"));
const races = files
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));

// Rate every race once; the market weight only changes the pricing step.
const rated = races.map((r) => {
  const points = classPoints(r.restrictions, r.name);
  const { rated } = rateEntries(r.entries, { classPoints: points, going: goingBand(r.going), distance: r.distance, track: r.trackName });
  const byTab = new Map(rated.map((x) => [x.key, x.ratings]));
  return r.entries.map((e) => {
    const g = byTab.get(String(e.number));
    return { key: String(e.number), rating: g && g.runs > 0 ? g.today : undefined, marketPrice: e.odds?.bestNow, scratched: e.scratched, won: e.horseResult?.finishPosition === 1 };
  });
});

interface Bet { edge: number; prob: number; market: number; won: boolean }
function betsAt(weight: number): Bet[] {
  const out: Bet[] = [];
  for (const inputs of rated) {
    const res = rateRace(inputs, { marketWeight: weight });
    if (res.confidence < 0.35) continue;
    for (const x of res.runners) {
      if (x.edge === undefined || !x.marketPrice) continue;
      out.push({ edge: x.edge, prob: x.probability, market: x.marketPrice, won: inputs.find((i) => i.key === x.key)!.won });
    }
  }
  return out;
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
const row = (label: string, bets: Bet[]) => {
  const won = bets.filter((b) => b.won).length;
  const units = bets.reduce((a, b) => a + (b.won ? b.market - 1 : -1), 0);
  const avgPrice = bets.reduce((a, b) => a + b.market, 0) / Math.max(1, bets.length);
  const avgEdge = bets.reduce((a, b) => a + b.edge, 0) / Math.max(1, bets.length);
  console.log(`${pad(label, 8)} ${pad(bets.length, 6)} ${pad((bets.length / races.length).toFixed(2), 9)} ${pad(`$${avgPrice.toFixed(1)}`, 9)} ${pad(`${(100 * avgEdge).toFixed(1)}`, 9)} ${pad(`${((100 * won) / Math.max(1, bets.length)).toFixed(0)}%`, 7)} ${pad(units.toFixed(1), 8)} ${pad(`${((100 * units) / Math.max(1, bets.length)).toFixed(0)}%`, 7)}`);
};
const head = (first: string) => console.log(`${pad(first, 8)} ${pad("bets", 6)} ${pad("per race", 9)} ${pad("avg $", 9)} ${pad("avg pts", 9)} ${pad("strike", 7)} ${pad("units", 8)} ${pad("roi", 7)}`);

console.log(`${races.length} resulted races. A bet is 3 points of chance above the market, price $26 or under, chance 8% or more.\n`);
console.log("BY MARKET WEIGHT");
head("weight");
const cache = new Map<number, Bet[]>();
for (const w of [0.7, 0.65, 0.6, 0.575, 0.55, 0.525, 0.5, 0.475, 0.45, 0.4]) {
  const all = betsAt(w);
  cache.set(w, all);
  row(w.toFixed(3), all.filter((b) => b.edge >= 0.03 && b.prob >= 0.08 && b.market <= 26));
}

console.log("");
console.log("BY MARKET WEIGHT, 3 POINTS, PRICE $15 OR UNDER");
head("weight");
for (const w of [0.7, 0.65, 0.6, 0.575, 0.55, 0.525, 0.5, 0.475, 0.45, 0.4]) row(w.toFixed(3), cache.get(w)!.filter((b) => b.edge >= 0.03 && b.prob >= 0.08 && b.market <= 15));

console.log("");
console.log("BY MARKET WEIGHT, 3 POINTS, ONLY BETS WHERE THE MARKET IS NO MORE THAN 60% ABOVE OUR PRICE");
head("weight");
for (const w of [0.7, 0.65, 0.6, 0.575, 0.55, 0.525, 0.5, 0.475, 0.45, 0.4]) row(w.toFixed(3), cache.get(w)!.filter((b) => b.edge >= 0.03 && b.prob >= 0.08 && b.market <= 26 && b.market * b.prob - 1 <= 0.6));

console.log("");
console.log("LAYS BY MARKET WEIGHT, 14 POINTS UNDER, PRICE $12 OR UNDER");
console.log(`${pad("weight", 8)} ${pad("lays", 6)} ${pad("per race", 9)} ${pad("avg $", 9)} ${pad("avg pts", 9)} ${pad("held", 7)} ${pad("units", 8)} ${pad("roi", 7)}`);
for (const w of [0.7, 0.65, 0.6, 0.575, 0.55, 0.525, 0.5, 0.475, 0.45, 0.4]) {
  const lays = cache.get(w)!.filter((b) => b.edge <= -0.14 && b.market <= 12);
  const held = lays.filter((b) => !b.won).length;
  const units = lays.reduce((a, b) => a + (b.won ? -(b.market - 1) : 1), 0);
  const avgPrice = lays.reduce((a, b) => a + b.market, 0) / Math.max(1, lays.length);
  const avgEdge = lays.reduce((a, b) => a + b.edge, 0) / Math.max(1, lays.length);
  console.log(`${pad(w.toFixed(3), 8)} ${pad(lays.length, 6)} ${pad((lays.length / races.length).toFixed(2), 9)} ${pad(`$${avgPrice.toFixed(1)}`, 9)} ${pad(`${(100 * avgEdge).toFixed(1)}`, 9)} ${pad(`${((100 * held) / Math.max(1, lays.length)).toFixed(0)}%`, 7)} ${pad(units.toFixed(1), 8)} ${pad(`${((100 * units) / Math.max(1, lays.length)).toFixed(0)}%`, 7)}`);
}

const W = Number(process.env.OVERLAY_MARKET_WEIGHT ?? 0.5);
const all = cache.get(W) ?? betsAt(W);
console.log(`\nPRIME THRESHOLDS AT WEIGHT ${W} (a Prime is a bet with at least this many points over the market)`);
head("points");
for (const p of [3, 4, 5, 6, 7, 8, 10, 12]) row(String(p), all.filter((b) => b.edge >= p / 100 && b.prob >= 0.08 && b.market <= 26));

console.log(`\nPRIME THRESHOLDS AT WEIGHT ${W} WITH A REAL CHANCE (our chance 15% or more, about $6.70 or shorter)`);
head("points");
for (const p of [3, 4, 5, 6, 7, 8, 10, 12]) row(String(p), all.filter((b) => b.edge >= p / 100 && b.prob >= 0.15 && b.market <= 26));
