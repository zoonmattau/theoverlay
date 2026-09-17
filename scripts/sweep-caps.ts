// Scores one setting of the run caps over every resulted race in the local
// Form King cache: log loss of the form and rated prices, where the form puts
// the market favourite, calibration on the runners each cap touches, and the
// bet and lay records. The knobs are read at import, so run once per setting:
// OVERLAY_CLOCK_FLOOR=3 OVERLAY_LOW_REACH=25 OVERLAY_OHR_PULL=0.3 OVERLAY_STAKES_LEVEL=96 npx tsx --tsconfig tsconfig.json scripts/sweep-caps.ts
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";
import { classPoints } from "../src/lib/model/ratings";

const races = readdirSync(".formking-cache")
  .filter((f) => f.startsWith("race-"))
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));

interface Row { form: number; rated: number; edge: number; market: number; fair: number; won: boolean; conf: number; slow: boolean; classDrop: boolean; ohrAbove: boolean; fav: boolean; formTop: boolean }
const rows: Row[] = [];
let favWon = 0, favN = 0, formTopWon = 0, favRankLow = 0, layRaces = 0;
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  const live = pub.runners.filter((x) => !x.scratched && x.formPrice && x.marketPrice && x.edge !== undefined && x.ratings.runs > 0);
  if (live.length < 4) continue;
  const formSum = live.reduce((a, x) => a + 1 / x.formPrice!, 0);
  const marketSum = live.reduce((a, x) => a + 1 / x.marketPrice!, 0);
  const par = classPoints(r.restrictions, r.raceName);
  const fav = [...live].sort((a, b) => a.marketPrice! - b.marketPrice!)[0];
  const byForm = [...live].sort((a, b) => b.ratings.today - a.ratings.today);
  favN++;
  if (byForm.findIndex((x) => x === fav) >= 3) favRankLow++;
  if (pub.runners.some((x) => x.signal === "lay")) layRaces++;
  for (const x of live) {
    const e = r.entries.find((y) => y.number === x.tabNumber)!;
    const won = e.horseResult?.finishPosition === 1;
    if (x === fav && won) favWon++;
    if (x === byForm[0] && won) formTopWon++;
    const past = (e.pastEvents ?? []).filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched).sort((a, b) => b.date - a.date).slice(0, 5);
    // A run where the clock sits three lengths or more under the margin reading: a slowly run race.
    const slow = past.some((p) => p.benchmark && p.margin !== undefined && p.benchmark.vsClass < -p.margin - 4);
    const classDrop = past.slice(0, 3).some((p) => /derby|oaks|guineas|group|listed|\bg[123]\b|stakes/i.test(p.raceName ?? "")) && par <= 62;
    const ohrAbove = (e.benchmarkRating ?? 0) >= par + 8;
    rows.push({ form: 1 / x.formPrice! / formSum, fair: 1 / x.marketPrice! / marketSum, rated: x.ratedProbability, edge: x.edge!, market: x.marketPrice!, won, conf: pub.confidence, slow, classDrop, ohrAbove, fav: x === fav, formTop: x === byForm[0] });
  }
}
const ll = (xs: Row[], p: (x: Row) => number) => -xs.reduce((a, x) => a + Math.log(Math.min(0.999, Math.max(0.001, x.won ? p(x) : 1 - p(x)))), 0) / Math.max(1, xs.length);
const calib = (xs: Row[]) => `${xs.length} runners, ${xs.filter((x) => x.won).length} won, form said ${xs.reduce((a, x) => a + x.form, 0).toFixed(0)}, market ${xs.reduce((a, x) => a + 1 / x.market, 0).toFixed(0)}`;
const bets = rows.filter((x) => x.conf >= 0.35 && x.edge >= 0.025 && x.rated >= 0.08 && x.market <= 26);
const lays = rows.filter((x) => x.conf >= 0.35 && x.edge <= -0.1 && x.market <= 12);
const betU = bets.reduce((a, x) => a + (x.won ? x.market - 1 : -1), 0);
const layU = lays.reduce((a, x) => a + (x.won ? -(x.market - 1) : 1), 0);
const tag = `say ${process.env.OVERLAY_EARLY_SAY ?? 0} norm ${process.env.OVERLAY_SECTION_NORM ?? 0} latefield ${process.env.OVERLAY_LATE_FIELD ?? 0} shape ${process.env.OVERLAY_SHAPE_POINTS ?? 0.5} closer ${process.env.OVERLAY_CLOSER_POINTS ?? 0} contest ${process.env.OVERLAY_CONTEST_POINTS ?? 0} sec ${process.env.OVERLAY_SECTION_WEIGHT ?? 0} rr ${process.env.OVERLAY_RR_PAR ?? 0} temp ${process.env.OVERLAY_TEMPERATURE ?? 8} floor ${process.env.OVERLAY_CLOCK_FLOOR ?? "inf"} reach ${process.env.OVERLAY_LOW_REACH ?? 12} ohr ${process.env.OVERLAY_OHR_PULL ?? 0} stakes ${process.env.OVERLAY_STAKES_LEVEL ?? 0}`;
console.log(
  `${tag}: logloss form ${ll(rows, (x) => x.form).toFixed(4)} rated ${ll(rows, (x) => x.rated).toFixed(4)} market ${ll(rows, (x) => x.fair).toFixed(4)} | ${favN} races, fav won ${favWon}, form top won ${formTopWon}, fav ranked 4th+ ${favRankLow}, lay races ${layRaces}` +
  `\n   fav: ${calib(rows.filter((x) => x.fav))}\n   form top: ${calib(rows.filter((x) => x.formTop))}\n   slow-run: ${calib(rows.filter((x) => x.slow))}\n   class drop: ${calib(rows.filter((x) => x.classDrop))}\n   ohr 8+ over par: ${calib(rows.filter((x) => x.ohrAbove))}` +
  `\n   ${bets.length} bets ${betU.toFixed(1)}u (${((100 * betU) / Math.max(1, bets.length)).toFixed(0)}%) | ${lays.length} lays ${layU.toFixed(1)}u (${((100 * layU) / Math.max(1, lays.length)).toFixed(0)}%)`,
);
