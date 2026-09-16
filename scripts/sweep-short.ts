// Scores one value of the short-favourite meld ceiling over every resulted
// race in the cache: how the meld calibrates by market price, log loss, and
// the lay record by price band. Read at import, so once per value:
// for w in 0.8 0.9 0.95 1; do OVERLAY_SHORT_WEIGHT=$w npx tsx --tsconfig tsconfig.json scripts/sweep-short.ts; done
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { LAY_EDGE, MIN_EDGE, publishRace } from "../src/lib/model/publish";

const races = readdirSync(".formking-cache")
  .filter((f) => f.startsWith("race-"))
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));
interface R { rated: number; market: number; won: boolean; conf: number; edge: number }
const rows: R[] = [];
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  for (const x of pub.runners) {
    if (x.scratched || !x.marketPrice || x.edge === undefined) continue;
    rows.push({ rated: x.ratedProbability, market: x.marketPrice, won: r.entries.find((y) => y.number === x.tabNumber)?.horseResult?.finishPosition === 1, conf: pub.confidence, edge: x.edge });
  }
}
const ll = -rows.reduce((a, x) => a + Math.log(Math.min(0.999, Math.max(0.001, x.won ? x.rated : 1 - x.rated))), 0) / rows.length;
const cal = (xs: R[]) => `${xs.filter((x) => x.won).length} won / said ${xs.reduce((a, x) => a + x.rated, 0).toFixed(0)}`;
const lay = (xs: R[]) => { const w = xs.filter((x) => x.won).length, u = xs.reduce((a, x) => a + (x.won ? -(x.market - 1) : 1), 0); return `${xs.length} lays ${w} won ${u.toFixed(1).padStart(6)}u ${(100 * u / Math.max(1, xs.length)).toFixed(0).padStart(4)}%`; };
const ok = rows.filter((x) => x.conf >= 0.35);
const lays = ok.filter((x) => x.edge <= LAY_EDGE && x.market <= 12);
const bets = ok.filter((x) => x.edge >= MIN_EDGE && x.rated >= 0.08 && x.market <= 26);
const bu = bets.reduce((a, x) => a + (x.won ? x.market - 1 : -1), 0);
console.log(`short ceiling ${process.env.OVERLAY_SHORT_WEIGHT ?? "default"} fl power ${process.env.OVERLAY_FL_POWER ?? "default"}: logloss ${ll.toFixed(4)} | under $2 ${cal(rows.filter((x) => x.market <= 2))} | $2-3 ${cal(rows.filter((x) => x.market > 2 && x.market <= 3))} | $3-5 ${cal(rows.filter((x) => x.market > 3 && x.market <= 5))}`);
console.log(`   lays: all ${lay(lays)} | under $2 ${lay(lays.filter((x) => x.market <= 2))} | $2-3 ${lay(lays.filter((x) => x.market > 2 && x.market <= 3))} | $3+ ${lay(lays.filter((x) => x.market > 3))}`);
console.log(`   bets: ${bets.length} bets ${bu.toFixed(1)}u ${(100 * bu / Math.max(1, bets.length)).toFixed(0)}%`);
