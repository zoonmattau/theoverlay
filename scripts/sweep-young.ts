// Scores one young-horse setting (OVERLAY_YOUNG_WEIGHTS / _TREND / _CAP, ratings.ts) over every resulted race in
// the local Form King cache: log loss of the form price and of the melded price, top pick strike rate, and the
// bet and lay record at the live thresholds, for all races, races with a young runner, and mixed-age races.
// "Young said / won" is the calibration that matters: in mixed-age races, did the young horses win more than the
// form gave them (underrated) or fewer (overrated)? Settings are read at import, so run once per setting:
//   npx tsx --tsconfig tsconfig.json scripts/sweep-young.ts
//   OVERLAY_YOUNG_WEIGHTS=0.55,0.3,0.15 npx tsx --tsconfig tsconfig.json scripts/sweep-young.ts
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { LAY_EDGE, MIN_EDGE, publishRace } from "../src/lib/model/publish";
import { isYoung } from "../src/lib/model/ratings";

const setting = `weights ${process.env.OVERLAY_YOUNG_WEIGHTS || "live"} trend ${process.env.OVERLAY_YOUNG_TREND || 0} cap ${process.env.OVERLAY_YOUNG_CAP || 10}`;
const files = readdirSync(".formking-cache").filter((f) => f.startsWith("race-"));
const races = files
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));

interface Row { form: number; rated: number; edge: number; market: number; won: boolean; confidence: number; young: boolean; race: "young" | "mixed" | "old"; top: boolean }
const rows: Row[] = [];
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  const live = pub.runners.filter((x) => !x.scratched && x.formPrice && x.marketPrice && x.edge !== undefined);
  if (live.length < 2) continue;
  const formSum = live.reduce((a, x) => a + 1 / x.formPrice!, 0);
  const ageOf = (tab: number) => r.entries.find((y) => y.number === tab)?.horse.age;
  const youngTabs = new Set(live.filter((x) => isYoung(ageOf(x.tabNumber))).map((x) => x.tabNumber));
  const kind = youngTabs.size === 0 ? "old" : youngTabs.size === live.length ? "young" : "mixed";
  const topTab = [...live].sort((a, b) => a.formPrice! - b.formPrice!)[0].tabNumber;
  for (const x of live) {
    const e = r.entries.find((y) => y.number === x.tabNumber);
    rows.push({ form: 1 / x.formPrice! / formSum, rated: x.ratedProbability, edge: x.edge!, market: x.marketPrice!, won: e?.horseResult?.finishPosition === 1, confidence: pub.confidence, young: youngTabs.has(x.tabNumber), race: kind, top: x.tabNumber === topTab });
  }
}

const ll = (xs: Row[], p: (x: Row) => number) => -xs.reduce((a, x) => a + Math.log(Math.min(0.999, Math.max(0.001, x.won ? p(x) : 1 - p(x)))), 0) / Math.max(1, xs.length);
const units = (xs: Row[], lay = false) => xs.reduce((a, x) => a + (lay ? (x.won ? -(x.market - 1) : 1) : x.won ? x.market - 1 : -1), 0);
const rec = (xs: Row[], lay = false) => `${xs.length} ${lay ? "lays" : "bets"} ${units(xs, lay) >= 0 ? "+" : ""}${units(xs, lay).toFixed(1)}u`;
const bets = (xs: Row[]) => xs.filter((x) => x.confidence >= 0.35 && x.edge >= MIN_EDGE && x.rated >= 0.08 && x.market <= 26);
const lays = (xs: Row[]) => xs.filter((x) => x.confidence >= 0.35 && x.edge <= LAY_EDGE && x.market <= 12);
const tops = (xs: Row[]) => xs.filter((x) => x.top);
const line = (label: string, xs: Row[]) => {
  const t = tops(xs);
  return `  ${label.padEnd(14)} ${String(xs.length).padStart(6)} runners | logloss form ${ll(xs, (x) => x.form).toFixed(4)} rated ${ll(xs, (x) => x.rated).toFixed(4)} | top pick won ${t.filter((x) => x.won).length}/${t.length} | ${rec(bets(xs))} | ${rec(lays(xs), true)}`;
};

console.log(`${setting}: ${races.length} races`);
console.log(line("all races", rows));
console.log(line("young only", rows.filter((x) => x.race === "young")));
console.log(line("mixed age", rows.filter((x) => x.race === "mixed")));
const ym = rows.filter((x) => x.race === "mixed" && x.young);
console.log(`  young in mixed: ${ym.length} runners, won ${ym.filter((x) => x.won).length}, form said ${ym.reduce((a, x) => a + x.form, 0).toFixed(1)}, market said ${ym.reduce((a, x) => a + 1 / x.market, 0).toFixed(1)} | ${rec(bets(ym))} | ${rec(lays(ym), true)}`);
