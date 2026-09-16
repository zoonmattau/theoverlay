// Scores one lay-side meld ceiling over every resulted race in the local
// Form King cache: how the horses we would lay, and the rest of their fields,
// calibrate against our chance; the lay record at several thresholds; the
// bet record with and without a lay in the race. Read at import, so once per value:
// for w in 0.5 0.6 0.7 0.8; do OVERLAY_LAY_OUTLIER_WEIGHT=$w npx tsx --tsconfig tsconfig.json scripts/sweep-lay-meld.ts; done
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const races = readdirSync(".formking-cache")
  .filter((f) => f.startsWith("race-"))
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));

interface Row { prob: number; mkt: number; edge: number; market: number; won: boolean; conf: number; layInRace: boolean; isLay: boolean; edgeRank: number }
const rows: Row[] = [];
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  const live = pub.runners.filter((x) => !x.scratched && x.marketPrice && x.edge !== undefined);
  const mktSum = live.reduce((a, x) => a + 1 / x.marketPrice!, 0);
  const lay = live.some((x) => x.signal === "lay");
  const byEdge = [...live].sort((a, b) => b.edge! - a.edge!);
  for (const x of live) {
    rows.push({
      prob: x.ratedProbability, mkt: 1 / x.marketPrice! / mktSum, edge: x.edge!, market: x.marketPrice!, conf: pub.confidence,
      won: r.entries.find((y) => y.number === x.tabNumber)?.horseResult?.finishPosition === 1, layInRace: lay, isLay: x.signal === "lay", edgeRank: byEdge.indexOf(x) + 1,
    });
  }
}
const ll = -rows.reduce((a, x) => a + Math.log(Math.min(0.999, Math.max(0.001, x.won ? x.prob : 1 - x.prob))), 0) / rows.length;
const cal = (xs: Row[]) => `${xs.filter((x) => x.won).length} won, we said ${xs.reduce((a, x) => a + x.prob, 0).toFixed(1)}, market ${xs.reduce((a, x) => a + x.mkt, 0).toFixed(1)}`;
const rec = (xs: Row[], lay = false) => {
  const w = xs.filter((x) => x.won).length, u = xs.reduce((a, x) => a + (lay ? (x.won ? -(x.market - 1) : 1) : x.won ? x.market - 1 : -1), 0);
  return `${String(xs.length).padStart(4)} ${lay ? "lays" : "bets"} ${String(w).padStart(3)} won ${u.toFixed(1).padStart(7)}u ${(100 * u / Math.max(1, xs.length)).toFixed(0).padStart(4)}%`;
};
const ok = rows.filter((x) => x.conf >= 0.35);
console.log(`lay ceiling ${process.env.OVERLAY_LAY_OUTLIER_WEIGHT ?? "default"} threshold ${process.env.OVERLAY_LAY_EDGE ?? "default"}: logloss ${ll.toFixed(4)} | laid: ${cal(ok.filter((x) => x.isLay))} | rest of lay races: ${cal(ok.filter((x) => x.layInRace && !x.isLay))}`);
for (const t of [-0.06, -0.08, -0.1, -0.12, -0.14]) console.log(`   lays at ${t}: ${rec(ok.filter((x) => x.edge <= t && x.market <= 12), true)}`);
const bets = ok.filter((x) => x.edge >= 0.025 && x.prob >= 0.08 && x.market <= 26);
console.log(`   bets: all ${rec(bets)} | clean races ${rec(bets.filter((x) => !x.layInRace))} | lay races ${rec(bets.filter((x) => x.layInRace))}`);
