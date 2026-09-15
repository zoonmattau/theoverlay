// Sweeps bet, Prime and lay thresholds in points over every resulted race in
// the local Form King cache, rating each race exactly as the build does and
// settling at the cached market price, one unit level stakes.
// npx tsx --tsconfig tsconfig.json scripts/sweep.ts
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const files = readdirSync(".formking-cache").filter((f) => f.startsWith("race-"));
const races = files
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));

interface Runner {
  edge: number;
  prob: number;
  market: number;
  won: boolean;
  confidence: number;
}
const runners: Runner[] = [];
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  for (const x of pub.runners) {
    if (x.scratched || x.edge === undefined || !x.marketPrice) continue;
    const e = r.entries.find((y) => y.number === x.tabNumber);
    runners.push({ edge: x.edge, prob: x.ratedProbability, market: x.marketPrice, won: e?.horseResult?.finishPosition === 1, confidence: pub.confidence });
  }
}
console.log(`${races.length} races, ${runners.length} priced runners, market weight ${process.env.OVERLAY_MARKET_WEIGHT ?? "default"}\n`);

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log("BETS (points of chance above the market, price $26 or under, chance 8% or more)");
console.log(`${pad("edge", 6)} ${pad("bets", 6)} ${pad("won", 5)} ${pad("strike", 7)} ${pad("units", 8)} ${pad("roi", 7)}  ${pad("bets/race", 9)}`);
for (const minEdge of [0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1]) {
  const bets = runners.filter((x) => x.confidence >= 0.35 && x.edge >= minEdge && x.prob >= 0.08 && x.market <= 26);
  const won = bets.filter((x) => x.won);
  const units = bets.reduce((a, x) => a + (x.won ? x.market - 1 : -1), 0);
  console.log(`${pad(minEdge.toFixed(3), 6)} ${pad(bets.length, 6)} ${pad(won.length, 5)} ${pad(`${((100 * won.length) / Math.max(1, bets.length)).toFixed(0)}%`, 7)} ${pad(units.toFixed(1), 8)} ${pad(`${((100 * units) / Math.max(1, bets.length)).toFixed(0)}%`, 7)}  ${pad((bets.length / races.length).toFixed(2), 9)}`);
}

console.log("\nPRIME (bets above the edge, with and without a floor on our chance)");
console.log(`${pad("edge", 6)} ${pad("floor", 6)} ${pad("bets", 6)} ${pad("won", 5)} ${pad("strike", 7)} ${pad("units", 8)} ${pad("roi", 7)}`);
for (const minEdge of [0.05, 0.06, 0.08, 0.1, 0.12]) {
  for (const floor of [0, 0.1, 0.15, 0.2]) {
    const bets = runners.filter((x) => x.confidence >= 0.35 && x.edge >= minEdge && x.prob >= Math.max(0.08, floor) && x.market <= 26);
    const won = bets.filter((x) => x.won);
    const units = bets.reduce((a, x) => a + (x.won ? x.market - 1 : -1), 0);
    console.log(`${pad(minEdge.toFixed(2), 6)} ${pad(floor.toFixed(2), 6)} ${pad(bets.length, 6)} ${pad(won.length, 5)} ${pad(`${((100 * won.length) / Math.max(1, bets.length)).toFixed(0)}%`, 7)} ${pad(units.toFixed(1), 8)} ${pad(`${((100 * units) / Math.max(1, bets.length)).toFixed(0)}%`, 7)}`);
  }
}

console.log("\nLAYS (points of chance below the market, price $12 or under; a lay wins one unit, loses price minus one)");
console.log(`${pad("edge", 6)} ${pad("lays", 6)} ${pad("held", 5)} ${pad("strike", 7)} ${pad("units", 8)} ${pad("roi", 7)}  ${pad("lays/race", 9)}`);
for (const layEdge of [-0.08, -0.1, -0.12, -0.14, -0.16, -0.2, -0.25]) {
  const lays = runners.filter((x) => x.confidence >= 0.35 && x.edge <= layEdge && x.market <= 12);
  const held = lays.filter((x) => !x.won);
  const units = lays.reduce((a, x) => a + (x.won ? -(x.market - 1) : 1), 0);
  console.log(`${pad(layEdge.toFixed(2), 6)} ${pad(lays.length, 6)} ${pad(held.length, 5)} ${pad(`${((100 * held.length) / Math.max(1, lays.length)).toFixed(0)}%`, 7)} ${pad(units.toFixed(1), 8)} ${pad(`${((100 * units) / Math.max(1, lays.length)).toFixed(0)}%`, 7)}  ${pad((lays.length / races.length).toFixed(2), 9)}`);
}

console.log("\nBETS AT 3 POINTS BY MARKET PRICE (weight as above)");
console.log(`${pad("price", 12)} ${pad("bets", 6)} ${pad("won", 5)} ${pad("strike", 7)} ${pad("units", 8)} ${pad("roi", 7)}`);
const bands: [string, number, number][] = [["to $3", 0, 3], ["$3 to $5", 3, 5], ["$5 to $8", 5, 8], ["$8 to $12", 8, 12], ["$12 to $26", 12, 26]];
for (const [label, lo, hi] of bands) {
  const bets = runners.filter((x) => x.confidence >= 0.35 && x.edge >= 0.03 && x.prob >= 0.08 && x.market <= 26 && x.market > lo && x.market <= hi);
  const won = bets.filter((x) => x.won);
  const units = bets.reduce((a, x) => a + (x.won ? x.market - 1 : -1), 0);
  console.log(`${pad(label, 12)} ${pad(bets.length, 6)} ${pad(won.length, 5)} ${pad(`${((100 * won.length) / Math.max(1, bets.length)).toFixed(0)}%`, 7)} ${pad(units.toFixed(1), 8)} ${pad(`${((100 * units) / Math.max(1, bets.length)).toFixed(0)}%`, 7)}`);
}

console.log("\nBETS AT 3 POINTS BY HOW FAR THE MARKET IS ABOVE OUR PRICE (the overlay share)");
console.log(`${pad("overlay", 12)} ${pad("bets", 6)} ${pad("won", 5)} ${pad("strike", 7)} ${pad("units", 8)} ${pad("roi", 7)}`);
const shares: [string, number, number][] = [["to 20%", 0, 0.2], ["20 to 35%", 0.2, 0.35], ["35 to 50%", 0.35, 0.5], ["50 to 75%", 0.5, 0.75], ["75 to 100%", 0.75, 1], ["over 100%", 1, 99]];
for (const [label, lo, hi] of shares) {
  const bets = runners.filter((x) => x.confidence >= 0.35 && x.edge >= 0.03 && x.prob >= 0.08 && x.market <= 26 && x.market * x.prob - 1 > lo && x.market * x.prob - 1 <= hi);
  const won = bets.filter((x) => x.won);
  const units = bets.reduce((a, x) => a + (x.won ? x.market - 1 : -1), 0);
  console.log(`${pad(label, 12)} ${pad(bets.length, 6)} ${pad(won.length, 5)} ${pad(`${((100 * won.length) / Math.max(1, bets.length)).toFixed(0)}%`, 7)} ${pad(units.toFixed(1), 8)} ${pad(`${((100 * units) / Math.max(1, bets.length)).toFixed(0)}%`, 7)}`);
}

console.log("\nBETS AT 3 POINTS WITH AN OVERLAY CAP (skip when the market is more than this above our price)");
console.log(`${pad("cap", 8)} ${pad("bets", 6)} ${pad("won", 5)} ${pad("strike", 7)} ${pad("units", 8)} ${pad("roi", 7)}  ${pad("bets/race", 9)}`);
for (const cap of [0.3, 0.4, 0.5, 0.6, 0.75, 1, 99]) {
  const bets = runners.filter((x) => x.confidence >= 0.35 && x.edge >= 0.03 && x.prob >= 0.08 && x.market <= 26 && x.market * x.prob - 1 <= cap);
  const won = bets.filter((x) => x.won);
  const units = bets.reduce((a, x) => a + (x.won ? x.market - 1 : -1), 0);
  console.log(`${pad(`${(cap * 100).toFixed(0)}%`, 8)} ${pad(bets.length, 6)} ${pad(won.length, 5)} ${pad(`${((100 * won.length) / Math.max(1, bets.length)).toFixed(0)}%`, 7)} ${pad(units.toFixed(1), 8)} ${pad(`${((100 * units) / Math.max(1, bets.length)).toFixed(0)}%`, 7)}  ${pad((bets.length / races.length).toFixed(2), 9)}`);
}

console.log("\nCOMBINATIONS: 3 points, a price cap and an overlay cap");
console.log(`${pad("price", 7)} ${pad("overlay", 8)} ${pad("bets", 6)} ${pad("won", 5)} ${pad("strike", 7)} ${pad("units", 8)} ${pad("roi", 7)}  ${pad("bets/race", 9)}`);
for (const priceCap of [10, 12, 15, 20, 26]) {
  for (const cap of [0.5, 0.6, 0.75, 99]) {
    const bets = runners.filter((x) => x.confidence >= 0.35 && x.edge >= 0.03 && x.prob >= 0.08 && x.market <= priceCap && x.market * x.prob - 1 <= cap);
    const won = bets.filter((x) => x.won);
    const units = bets.reduce((a, x) => a + (x.won ? x.market - 1 : -1), 0);
    console.log(`${pad(`$${priceCap}`, 7)} ${pad(cap > 1 ? "none" : `${(cap * 100).toFixed(0)}%`, 8)} ${pad(bets.length, 6)} ${pad(won.length, 5)} ${pad(`${((100 * won.length) / Math.max(1, bets.length)).toFixed(0)}%`, 7)} ${pad(units.toFixed(1), 8)} ${pad(`${((100 * units) / Math.max(1, bets.length)).toFixed(0)}%`, 7)}  ${pad((bets.length / races.length).toFixed(2), 9)}`);
  }
}
