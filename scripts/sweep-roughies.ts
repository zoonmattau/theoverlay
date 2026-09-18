// Roughies: runners at ROUGH_FROM or longer with the market longer than our price, over every resulted
// race in the cache, by edge line, settled at the pre-jump price and at SP, per unit staked.
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const FROM = Number(process.env.ROUGH_FROM ?? 26);
const TRUST_FLOOR = Number(process.env.OVERLAY_TRUST_FLOOR ?? 0.3);
const races = readdirSync(".formking-cache").filter((f) => f.startsWith("race-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary).filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));
interface Row { edge: number; market: number; sp?: number; won: boolean; rated: number; rank: number | null; formPrice?: number }
const rows: Row[] = [];
let n = 0;
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  if (pub.confidence < 0.35) continue;
  n++;
  for (const x of pub.runners) {
    if (x.scratched || !x.marketPrice || x.edge === undefined || x.ratings.runs === 0 || (x.ratings.trust ?? 1) < TRUST_FLOOR || x.marketPrice < FROM) continue;
    const e = r.entries.find((y) => y.number === x.tabNumber)!;
    rows.push({ edge: x.edge, market: x.marketPrice, sp: e.horseResult?.startingPrice || undefined, won: e.horseResult?.finishPosition === 1, rated: x.ratedProbability, rank: x.rank, formPrice: x.formPrice });
  }
}
const settle = (xs: Row[], at: (x: Row) => number) => xs.reduce((a, x) => a + (x.won ? at(x) - 1 : -1), 0);
const fmt = (u: number, k: number) => `${u >= 0 ? "+" : ""}${u.toFixed(1)}u ${k ? `(${((100 * u) / k).toFixed(0)}%)` : ""}`;
console.log(`${n} races, ${rows.length} runners at $${FROM}+ with a rating\n`);
console.log("all runners at this price, no edge test:", `n=${rows.length} won ${rows.filter((x) => x.won).length}`, "at price", fmt(settle(rows, (x) => x.market), rows.length), "at SP", fmt(settle(rows, (x) => x.sp ?? x.market), rows.length));
for (const line of [0, 0.005, 0.01, 0.015, 0.02, 0.03]) {
  const b = rows.filter((x) => x.edge >= line);
  console.log(`edge >= ${(line * 100).toFixed(1)} pts  n=${String(b.length).padStart(4)} (${(b.length / n).toFixed(2)}/race) won ${String(b.filter((x) => x.won).length).padStart(3)}  at price ${fmt(settle(b, (x) => x.market), b.length).padEnd(16)} at SP ${fmt(settle(b, (x) => x.sp ?? x.market), b.length)}`);
}
for (const [lo, hi] of [[26, 41], [41, 61], [61, 101], [101, 1000]]) {
  const b = rows.filter((x) => x.edge >= 0.01 && x.market >= lo && x.market < hi);
  console.log(`  edge >= 1, $${lo}-${hi}: n=${b.length} won ${b.filter((x) => x.won).length} at price ${fmt(settle(b, (x) => x.market), b.length)} at SP ${fmt(settle(b, (x) => x.sp ?? x.market), b.length)}`);
}
const top = rows.filter((x) => x.edge >= 0.01 && x.rank !== null);
console.log(`  edge >= 1 and in our top four: n=${top.length} won ${top.filter((x) => x.won).length} at price ${fmt(settle(top, (x) => x.market), top.length)} at SP ${fmt(settle(top, (x) => x.sp ?? x.market), top.length)}`);
