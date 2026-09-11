// Sweeps temperature and market weight over the cached live card and reports
// what edge thresholds would give about one bet in five races.
import { readdirSync, readFileSync } from "node:fs";
import type { MeetingSummaryLite, RaceSummary } from "../src/lib/formking/types";
import { classPoints, goingBand, rateEntries } from "../src/lib/model/ratings";
import { rateRace } from "../src/lib/model/rate";

const files = readdirSync(".formking-cache");
const meetings = files.filter((f) => f.startsWith("meetings-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as MeetingSummaryLite[]).flat();
const races = files.filter((f) => f.startsWith("race-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary);

const inputs = races.map((r) => {
  const m = meetings.find((x) => x.races?.some((y) => y.raceId === r.raceId));
  const points = classPoints(r.restrictions, r.name);
  const { rated } = rateEntries(r.entries, { classPoints: points, going: goingBand(r.going), distance: r.distance, track: r.trackName ?? m?.trackName });
  const byTab = new Map(rated.map((x) => [x.key, x.ratings]));
  return r.entries.map((e) => {
    const g = byTab.get(String(e.number));
    return { key: String(e.number), rating: g && g.runs > 0 ? g.today : undefined, marketPrice: e.odds?.bestNow, scratched: e.scratched };
  });
});

for (const temperature of [8]) {
  for (const marketWeight of [0.8]) {
    const edges: number[] = [];
    let dev = 0, n = 0;
    for (const inp of inputs) {
      const out = rateRace(inp, { temperature, marketWeight });
      for (const x of out.runners) {
        if (x.edge === undefined || !x.marketPrice) continue;
        dev += Math.abs(Math.log(x.marketPrice / x.ratedPrice)); n++;
        // Bettable: a real chance and a price someone would take. Layable: short enough to matter.
        if (x.edge > 0 && x.probability >= 0.08 && x.marketPrice <= 26) edges.push(x.edge);
        if (x.edge < 0 && x.marketPrice <= 12) edges.push(x.edge);
        if (x.edge > 0 && x.probability >= 0.08 && x.marketPrice <= 26) console.log(`  bet candidate ${x.key} rated $${x.ratedPrice} mkt $${x.marketPrice} edge ${(x.edge * 100).toFixed(1)}pts`);
      }
    }
    const sorted = [...edges].sort((a, b) => b - a);
    const betAt = sorted[Math.round(races.length / 5) - 1];   // edge of the ~6th best
    const layAt = [...edges].sort((a, b) => a - b).filter((e) => e < 0)[Math.round(races.length / 3) - 1];
    console.log(`T=${temperature} w=${marketWeight}: mean|log| ${(dev / n).toFixed(2)}  bet threshold for ${Math.round(races.length / 5)} bets: ${((betAt ?? 0) * 100).toFixed(0)}%  lay threshold for ${Math.round(races.length / 3)} lays: ${((layAt ?? 0) * 100).toFixed(0)}%  bettable>8%: ${edges.filter((e) => e >= 0.08).length} layable<-20%: ${edges.filter((e) => e <= -0.2).length}`);
  }
}
