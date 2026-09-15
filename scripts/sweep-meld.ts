// Sweeps the meld: base market weight, the ceiling the market's weight
// climbs to on big disagreements, and how fast it climbs. Bets are 3 points
// over, price $26 or under; lays 14 under, $12 or under. One unit level
// stakes at the cached price over every resulted race in the local cache.
// npx tsx --tsconfig tsconfig.json scripts/sweep-meld.ts
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { rateRace } from "../src/lib/model/rate";
import { classPoints, goingBand, rateEntries } from "../src/lib/model/ratings";

const files = readdirSync(".formking-cache").filter((f) => f.startsWith("race-"));
const races = files
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));

const rated = races.map((r) => {
  const points = classPoints(r.restrictions, r.name);
  const { rated } = rateEntries(r.entries, { classPoints: points, going: goingBand(r.going), distance: r.distance, track: r.trackName });
  const byTab = new Map(rated.map((x) => [x.key, x.ratings]));
  return r.entries.map((e) => {
    const g = byTab.get(String(e.number));
    return { key: String(e.number), rating: g && g.runs > 0 ? g.today : undefined, marketPrice: e.odds?.bestNow, scratched: e.scratched, won: e.horseResult?.finishPosition === 1 };
  });
});

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(`${races.length} resulted races. Bet: 3 points over, $26 or under, 8% chance or more. Lay: 14 points under, $12 or under.\n`);
console.log(`${pad("base", 5)} ${pad("ceil", 5)} ${pad("scale", 6)} | ${pad("bets", 5)} ${pad("/race", 6)} ${pad("avg $", 6)} ${pad("avg pts", 7)} ${pad("strike", 6)} ${pad("units", 7)} ${pad("roi", 5)} | ${pad("lays", 5)} ${pad("/race", 6)} ${pad("held", 5)} ${pad("units", 7)} ${pad("roi", 5)} | ${pad("max $", 6)}`);

for (const base of [0.4, 0.5, 0.6]) {
  for (const ceil of [base, 0.7, 0.8, 0.9]) {
    if (ceil < base) continue;
    for (const scale of ceil === base ? [1] : [0.7, 1.0, 1.5, 2.0]) {
      const bets: { market: number; edge: number; won: boolean }[] = [];
      const lays: { market: number; won: boolean }[] = [];
      for (const inputs of rated) {
        const res = rateRace(inputs, { marketWeight: base, outlierWeight: ceil, outlierScale: scale });
        if (res.confidence < 0.35) continue;
        for (const x of res.runners) {
          if (x.edge === undefined || !x.marketPrice) continue;
          const won = inputs.find((i) => i.key === x.key)!.won;
          if (x.edge >= 0.03 && x.probability >= 0.08 && x.marketPrice <= 26) bets.push({ market: x.marketPrice, edge: x.edge, won });
          if (x.edge <= -0.14 && x.marketPrice <= 12) lays.push({ market: x.marketPrice, won });
        }
      }
      const bw = bets.filter((b) => b.won).length;
      const bu = bets.reduce((a, b) => a + (b.won ? b.market - 1 : -1), 0);
      const avg = bets.reduce((a, b) => a + b.market, 0) / Math.max(1, bets.length);
      const avgEdge = bets.reduce((a, b) => a + b.edge, 0) / Math.max(1, bets.length);
      const lh = lays.filter((l) => !l.won).length;
      const lu = lays.reduce((a, l) => a + (l.won ? -(l.market - 1) : 1), 0);
      const maxPrice = Math.max(0, ...bets.map((b) => b.market));
      console.log(`${pad(base.toFixed(2), 5)} ${pad(ceil.toFixed(2), 5)} ${pad(ceil === base ? "-" : scale.toFixed(1), 6)} | ${pad(bets.length, 5)} ${pad((bets.length / races.length).toFixed(2), 6)} ${pad(`$${avg.toFixed(1)}`, 6)} ${pad((100 * avgEdge).toFixed(1), 7)} ${pad(`${((100 * bw) / Math.max(1, bets.length)).toFixed(0)}%`, 6)} ${pad(bu.toFixed(1), 7)} ${pad(`${((100 * bu) / Math.max(1, bets.length)).toFixed(0)}%`, 5)} | ${pad(lays.length, 5)} ${pad((lays.length / races.length).toFixed(2), 6)} ${pad(`${((100 * lh) / Math.max(1, lays.length)).toFixed(0)}%`, 5)} ${pad(lu.toFixed(1), 7)} ${pad(`${((100 * lu) / Math.max(1, lays.length)).toFixed(0)}%`, 5)} | ${pad(`$${maxPrice.toFixed(0)}`, 6)}`);
    }
  }
}
