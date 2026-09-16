// Scores one value of the two-year-old run drop over every resulted race in
// the local Form King cache: log loss of the form-only price and of the melded
// price, and the bet and lay record at the live thresholds. The drop is read
// at import, so run once per value:
// for d in 0 5 10 15; do OVERLAY_JUVENILE_DROP=$d npx tsx --tsconfig tsconfig.json scripts/sweep-juvenile.ts; done
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { LAY_EDGE, MIN_EDGE, publishRace } from "../src/lib/model/publish";
import { wasJuvenile } from "../src/lib/model/ratings";

const drop = process.env.OVERLAY_JUVENILE_DROP ?? "0 (default)";
const files = readdirSync(".formking-cache").filter((f) => f.startsWith("race-"));
const races = files
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));

interface Row { form: number; rated: number; edge: number; market: number; won: boolean; confidence: number; juvenile: boolean; touched: boolean }
const rows: Row[] = [];
let touchedRaces = 0;
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  const live = pub.runners.filter((x) => !x.scratched && x.formPrice && x.marketPrice && x.edge !== undefined);
  const formSum = live.reduce((a, x) => a + 1 / x.formPrice!, 0);
  const juvenileOf = (tab: number) => {
    const e = r.entries.find((y) => y.number === tab);
    return (e?.pastEvents ?? []).some((p) => p.race !== false && !p.trial && !p.spell && wasJuvenile(p, e?.horse.age, r.date));
  };
  const flags = new Map(live.map((x) => [x.tabNumber, juvenileOf(x.tabNumber)]));
  const touched = [...flags.values()].some(Boolean);
  if (touched) touchedRaces++;
  for (const x of live) {
    const e = r.entries.find((y) => y.number === x.tabNumber);
    rows.push({
      form: 1 / x.formPrice! / formSum, rated: x.ratedProbability, edge: x.edge!, market: x.marketPrice!,
      won: e?.horseResult?.finishPosition === 1, confidence: pub.confidence, juvenile: flags.get(x.tabNumber)!, touched,
    });
  }
}

const ll = (xs: Row[], p: (x: Row) => number) => -xs.reduce((a, x) => a + Math.log(Math.min(0.999, Math.max(0.001, x.won ? p(x) : 1 - p(x)))), 0) / Math.max(1, xs.length);
const f2 = (n: number) => n.toFixed(4);
const record = (xs: Row[], lay = false) => {
  const won = xs.filter((x) => x.won).length;
  const units = xs.reduce((a, x) => a + (lay ? (x.won ? -(x.market - 1) : 1) : x.won ? x.market - 1 : -1), 0);
  return `${String(xs.length).padStart(4)} ${lay ? "lays" : "bets"} ${String(won).padStart(3)} won ${units.toFixed(1).padStart(7)} units ${((100 * units) / Math.max(1, xs.length)).toFixed(0).padStart(4)}% roi`;
};
const bets = (xs: Row[]) => xs.filter((x) => x.confidence >= 0.35 && x.edge >= MIN_EDGE && x.rated >= 0.08 && x.market <= 26);
const primes = (xs: Row[]) => xs.filter((x) => x.confidence >= 0.35 && x.edge >= 0.05 && x.rated >= 0.15 && x.market <= 26);
const lays = (xs: Row[]) => xs.filter((x) => x.confidence >= 0.35 && x.edge <= LAY_EDGE && x.market <= 12);

const touchedRows = rows.filter((x) => x.touched);
const juv = rows.filter((x) => x.juvenile);
console.log(`drop ${drop}: ${races.length} races, ${touchedRaces} with a juvenile-form runner, ${juv.length} such runners`);
console.log(`  all races      logloss form ${f2(ll(rows, (x) => x.form))} rated ${f2(ll(rows, (x) => x.rated))} | ${record(bets(rows))} | prime ${record(primes(rows))} | ${record(lays(rows), true)}`);
console.log(`  touched races  logloss form ${f2(ll(touchedRows, (x) => x.form))} rated ${f2(ll(touchedRows, (x) => x.rated))} | ${record(bets(touchedRows))} | prime ${record(primes(touchedRows))} | ${record(lays(touchedRows), true)}`);
console.log(`  juvenile-form  logloss form ${f2(ll(juv, (x) => x.form))} rated ${f2(ll(juv, (x) => x.rated))} | won ${juv.filter((x) => x.won).length}, form said ${juv.reduce((a, x) => a + x.form, 0).toFixed(1)}, market said ${juv.reduce((a, x) => a + 1 / x.market, 0).toFixed(1)} | ${record(bets(juv))} | ${record(lays(juv), true)}`);
