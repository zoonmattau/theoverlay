// Scores one setting of the layoff and distance-gap penalties over every
// resulted race in the local Form King cache: calibration of the form price
// on the runners each touches, log loss overall, and the bet record. Both are
// read at import, so run once per setting:
// for l in 0 4 8 12; do for d in 0 1 2; do OVERLAY_LAYOFF_POINTS=$l OVERLAY_DISTANCE_GAP_RATE=$d npx tsx --tsconfig tsconfig.json scripts/sweep-layoff.ts; done; done
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const races = readdirSync(".formking-cache")
  .filter((f) => f.startsWith("race-"))
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));

interface Row { form: number; rated: number; edge: number; market: number; won: boolean; conf: number; layoff: boolean; gap: boolean }
const rows: Row[] = [];
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  const live = pub.runners.filter((x) => !x.scratched && x.formPrice && x.marketPrice && x.edge !== undefined && x.ratings.runs > 0);
  const formSum = live.reduce((a, x) => a + 1 / x.formPrice!, 0);
  for (const x of live) {
    const e = r.entries.find((y) => y.number === x.tabNumber)!;
    const past = (e.pastEvents ?? []).filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched).sort((a, b) => b.date - a.date).slice(0, 5);
    rows.push({
      form: 1 / x.formPrice! / formSum, rated: x.ratedProbability, edge: x.edge!, market: x.marketPrice!, won: e.horseResult?.finishPosition === 1, conf: pub.confidence,
      layoff: (e.daysSinceLastRace ?? 0) > 300, gap: !past.some((p) => Math.abs(p.distance - r.distance) <= 200),
    });
  }
}
const ll = (xs: Row[], p: (x: Row) => number) => -xs.reduce((a, x) => a + Math.log(Math.min(0.999, Math.max(0.001, x.won ? p(x) : 1 - p(x)))), 0) / Math.max(1, xs.length);
const calib = (xs: Row[]) => `${xs.filter((x) => x.won).length} won, form said ${xs.reduce((a, x) => a + x.form, 0).toFixed(1)}`;
const bets = rows.filter((x) => x.conf >= 0.35 && x.edge >= 0.025 && x.rated >= 0.08 && x.market <= 26);
const units = bets.reduce((a, x) => a + (x.won ? x.market - 1 : -1), 0);
console.log(
  `layoff ${process.env.OVERLAY_LAYOFF_POINTS ?? "default"} gap ${process.env.OVERLAY_DISTANCE_GAP_RATE ?? "default"}: logloss form ${ll(rows, (x) => x.form).toFixed(4)} rated ${ll(rows, (x) => x.rated).toFixed(4)} | layoff runners ${calib(rows.filter((x) => x.layoff))} | gap runners ${calib(rows.filter((x) => x.gap))} | ${bets.length} bets ${units.toFixed(1)} units ${((100 * units) / Math.max(1, bets.length)).toFixed(0)}%`,
);
