// Where the bet line should sit: every resulted race in the local cache is
// published once with the current model, and the bets at each edge line are
// settled at the pre-jump price and at the SP, midweek and Saturday apart.
// The meld ceiling is read at import, so run once per setting:
// OVERLAY_OUTLIER_WEIGHT=0.7 npx tsx --tsconfig tsconfig.json scripts/sweep-bet-line.ts
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const TRUST_FLOOR = Number(process.env.OVERLAY_TRUST_FLOOR ?? 0.4);
const races = readdirSync(".formking-cache")
  .filter((f) => f.startsWith("race-"))
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));

interface Row { sat: boolean; edge: number; market: number; sp?: number; won: boolean; rated: number; layEdge: number; layPrice: number }
const rows: Row[] = [];
let n = 0, nSat = 0;
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  if (pub.confidence < 0.35) continue;
  const sat = new Date(Number(r.date) + 10 * 3600_000).getUTCDay() === 6;
  n++; if (sat) nSat++;
  for (const x of pub.runners) {
    if (x.scratched || !x.marketPrice || x.edge === undefined || x.ratings.runs === 0 || (x.ratings.trust ?? 1) < TRUST_FLOOR) continue;
    const e = r.entries.find((y) => y.number === x.tabNumber)!;
    rows.push({ sat, edge: x.edge, market: x.marketPrice, sp: e.horseResult?.startingPrice || undefined, won: e.horseResult?.finishPosition === 1, rated: x.ratedProbability, layEdge: x.layEdge ?? x.edge, layPrice: x.layPrice ?? x.marketPrice });
  }
}
const settle = (xs: Row[], at: (x: Row) => number) => xs.reduce((a, x) => a + (x.won ? at(x) - 1 : -1), 0);
const fmt = (u: number, k: number) => `${u >= 0 ? "+" : ""}${u.toFixed(1)}u ${k ? `${((100 * u) / k).toFixed(0)}%` : ""}`;
console.log(`${n} races (${nSat} Saturday, ${n - nSat} midweek), meld ceiling ${process.env.OVERLAY_OUTLIER_WEIGHT ?? 0.8}, market weight ${process.env.OVERLAY_MARKET_WEIGHT ?? 0.5}\n`);
for (const [label, keep, races] of [["all", () => true, n], ["midweek", (x: Row) => !x.sat, n - nSat], ["saturday", (x: Row) => x.sat, nSat]] as const) {
  console.log(label);
  for (const line of [0.01, 0.015, 0.02, 0.025, 0.03, 0.04]) {
    const bets = rows.filter((x) => keep(x) && x.edge >= line && x.rated >= 0.08 && x.market <= 26);
    const wins = bets.filter((x) => x.won).length;
    console.log(`  line ${(line * 100).toFixed(1).padStart(4)} pts  n=${String(bets.length).padStart(4)} (${(bets.length / races).toFixed(2)}/race)  won ${String(wins).padStart(3)} (${bets.length ? ((100 * wins) / bets.length).toFixed(0) : 0}%)  at price ${fmt(settle(bets, (x) => x.market), bets.length).padEnd(14)} at SP ${fmt(settle(bets, (x) => x.sp ?? x.market), bets.length)}`);
  }
  const lays = rows.filter((x) => keep(x) && x.layEdge <= -0.06 && x.layPrice <= 12);
  console.log(`  lays at -6     n=${String(lays.length).padStart(4)} (${(lays.length / races).toFixed(2)}/race)  held ${lays.filter((x) => !x.won).length}  ${fmt(lays.reduce((a, x) => a + (x.won ? -(x.layPrice - 1) : 0.95), 0), lays.length)}`);
}
