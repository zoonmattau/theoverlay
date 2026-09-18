// One setting of the winning-run factor over every resulted race in the cache: the rated price's log
// loss, the calibration on streak horses, and the bet and lay records. The knob is read at import:
// OVERLAY_STREAK_POINTS=2 npx tsx --tsconfig tsconfig.json scripts/sweep-streak.ts
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const races = readdirSync(".formking-cache").filter((f) => f.startsWith("race-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary).filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));
interface Row { streak: number; form: number; rated: number; market: number; won: boolean; signal?: string; price: number; layPrice: number; sp?: number; edge: number }
const rows: Row[] = [];
let n = 0;
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  if (pub.confidence < 0.35) continue;
  n++;
  const live = pub.runners.filter((x) => !x.scratched && x.formPrice && x.marketPrice && x.edge !== undefined);
  const formSum = live.reduce((a, x) => a + 1 / x.formPrice!, 0);
  const mkSum = live.reduce((a, x) => a + 1 / x.marketPrice!, 0);
  for (const x of live) {
    const e = r.entries.find((y) => y.number === x.tabNumber)!;
    const past = (e.pastEvents ?? []).filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched).sort((a, b) => b.date - a.date);
    let streak = 0;
    for (const p of past) { if (p.finishPosition === 1) streak++; else break; }
    rows.push({ streak, form: 1 / x.formPrice! / formSum, rated: x.ratedProbability, market: 1 / x.marketPrice! / mkSum, won: e.horseResult?.finishPosition === 1, signal: x.signal, price: x.marketPrice!, layPrice: x.layPrice ?? x.marketPrice!, sp: e.horseResult?.startingPrice || undefined, edge: x.edge! });
  }
}
const ll = (xs: Row[], p: (x: Row) => number) => -xs.reduce((a, x) => a + Math.log(Math.min(0.999, Math.max(0.001, x.won ? p(x) : 1 - p(x)))), 0) / Math.max(1, xs.length);
const sum = (xs: Row[], k: "form" | "rated" | "market") => xs.reduce((a, x) => a + x[k], 0).toFixed(0);
const bets = rows.filter((x) => x.signal === "back"), lays = rows.filter((x) => x.signal === "lay");
const betU = bets.reduce((a, x) => a + (x.won ? x.price - 1 : -1), 0), betSp = bets.reduce((a, x) => a + (x.won ? (x.sp ?? x.price) - 1 : -1), 0);
const layU = lays.reduce((a, x) => a + (x.won ? -(x.layPrice - 1) : 0.95), 0);
console.log(`streak ${process.env.OVERLAY_STREAK_POINTS ?? 0} pts: ${n} races, log loss form ${ll(rows, (x) => x.form).toFixed(4)} rated ${ll(rows, (x) => x.rated).toFixed(4)} market ${ll(rows, (x) => x.market).toFixed(4)}`);
for (const s of [1, 2, 3]) { const xs = rows.filter((x) => (s === 3 ? x.streak >= 3 : x.streak === s)); console.log(`  streak ${s}${s === 3 ? "+" : ""}: n=${xs.length} won ${xs.filter((x) => x.won).length} form ${sum(xs, "form")} rated ${sum(xs, "rated")} market ${sum(xs, "market")}  laid ${xs.filter((x) => x.signal === "lay").length} of which won ${xs.filter((x) => x.signal === "lay" && x.won).length}  backed ${xs.filter((x) => x.signal === "back").length} of which won ${xs.filter((x) => x.signal === "back" && x.won).length}`); }
console.log(`  bets ${bets.length} (${(bets.length / n).toFixed(2)}/race) ${betU >= 0 ? "+" : ""}${betU.toFixed(1)}u ${((100 * betU) / Math.max(1, bets.length)).toFixed(0)}% (SP ${((100 * betSp) / Math.max(1, bets.length)).toFixed(0)}%)  lays ${lays.length} (${(lays.length / n).toFixed(2)}/race) ${layU >= 0 ? "+" : ""}${layU.toFixed(1)}u ${((100 * layU) / Math.max(1, lays.length)).toFixed(0)}%`);
