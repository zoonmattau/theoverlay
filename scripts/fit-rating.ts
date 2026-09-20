// Fits the rating: which pieces of a horse's form predict how it runs
// against its field, with weights estimated on the cached races rather than
// set by hand. The target is each runner's beaten margin relative to the
// race's mean; the features are what the rating is built from today, with
// no market price among them. Fit on the days before OVERLAY_FIT_SPLIT
// (default 2026-09-11), test on the days from it.
// npx tsx --tsconfig tsconfig.json scripts/fit-rating.ts
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { RaceEntry, RaceSummary } from "../src/lib/formking/types";
import { classPoints, clockPoints, goingBand, rateEntries, recentRuns, runPoints } from "../src/lib/model/ratings";
import { prepStage } from "../src/lib/model/factors";
import { devig } from "../src/lib/model/rate";

const SPLIT = process.env.OVERLAY_FIT_SPLIT ?? "2026-09-11";
const sydney = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

const races = readdirSync(".formking-cache")
  .filter((f) => f.startsWith("race-"))
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));

const FEATURES = [
  "cls", "last", "second", "best2", "meanRun", "trend",
  "early", "mid", "late", "pressure", "tempoFit", "goingFit", "distFit", "trackFit",
  "weight", "fresh", "jockey", "trainer", "barrier", "streak", "shape", "fk",
  "trust", "runs", "ppir", "lastMargin", "daysSince", "prep", "ohr",
] as const;
type Feature = (typeof FEATURES)[number];

interface Row {
  date: string; raceId: string; tab: number; horse: string;
  x: Record<Feature, number>;
  /** Beaten lengths, race-centred, sign flipped so higher is better. */
  y: number;
  won: boolean; market: number; formProb: number; today: number;
}

const rows: Row[] = [];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

for (const r of races) {
  const par = classPoints(r.restrictions, r.name);
  const date = sydney(Number(r.date));
  const { rated } = rateEntries(r.entries, { classPoints: par, going: goingBand(r.going), distance: r.distance, track: r.trackName, date: r.date });
  const byTab = new Map(rated.map((x) => [x.key, x.ratings]));
  const live = r.entries.filter((e) => !e.scratched && e.horseResult && e.horseResult.finishPosition > 0 && e.odds?.bestNow);
  if (live.length < 5) continue;
  const margins = live.map((e) => e.horseResult!.margin ?? (e.horseResult!.finishPosition - 1) * 1.5);
  const meanMargin = mean(margins);
  // The form's own probabilities, from today's rating, for the comparison.
  const T = 8;
  const todays = live.map((e) => byTab.get(String(e.number))?.today ?? par);
  const maxT = Math.max(...todays);
  const w = todays.map((t) => Math.exp((t - maxT) / T));
  const wSum = w.reduce((a, b) => a + b, 0);
  const raw: { e: RaceEntry; x: Record<Feature, number>; y: number; i: number }[] = [];
  for (const [i, e] of live.entries()) {
    const g = byTab.get(String(e.number));
    if (!g || g.runs === 0) continue;
    const runs = recentRuns(e, r.date);
    const pts = runs.map((p) => runPoints(p, par, e.horse.age, r.date));
    const f = g.factors as Record<string, number>;
    const best2 = [...pts].sort((a, b) => b - a).slice(0, 2);
    const x: Record<Feature, number> = {
      cls: g.class, last: pts[0] ?? g.class, second: pts[1] ?? pts[0] ?? g.class, best2: mean(best2), meanRun: mean(pts),
      trend: pts.length >= 3 ? mean(pts.slice(0, 2)) - mean(pts.slice(2)) : 0,
      early: g.early - g.class, mid: g.mid - g.class, late: g.late - g.class, pressure: g.pressure - g.class,
      tempoFit: (f.tempo ?? 0), goingFit: (f.going ?? 0), distFit: (f.distance ?? 0), trackFit: (f.track ?? 0),
      weight: f.weight ?? 0, fresh: f.fresh ?? 0, jockey: f.jockey ?? 0, trainer: f.trainer ?? 0, barrier: f.barrier ?? 0, streak: f.streak ?? 0, shape: f.shape ?? 0, fk: f.market ?? 0,
      trust: g.trust, runs: g.runs, ppir: g.ppir, lastMargin: runs[0]?.margin ?? 0, daysSince: Math.min(400, e.daysSinceLastRace ?? 30), prep: prepStage(e),
      ohr: e.benchmarkRating && e.benchmarkRating > 0 ? e.benchmarkRating - par : 0,
    };
    raw.push({ e, x, y: -(margins[i] - meanMargin) * clockPoints(r.distance), i });
  }
  if (raw.length < 4) continue;
  // Centre every feature within the race: the rating only ever has to order a field.
  const centred = Object.fromEntries(FEATURES.map((k) => [k, mean(raw.map((q) => q.x[k]))])) as Record<Feature, number>;
  for (const q of raw) {
    const x = Object.fromEntries(FEATURES.map((k) => [k, q.x[k] - centred[k]])) as Record<Feature, number>;
    rows.push({ date, raceId: r.raceId, tab: q.e.number, horse: q.e.horse.name, x, y: q.y, won: q.e.horseResult!.finishPosition === 1, market: q.e.odds!.bestNow!, formProb: w[q.i] / wSum, today: todays[q.i] });
  }
}

const train = rows.filter((r) => r.date < SPLIT);
const test = rows.filter((r) => r.date >= SPLIT);
console.log(`runs ${rows.length}: fit on ${train.length} (${new Set(train.map((r) => r.raceId)).size} races before ${SPLIT}), test on ${test.length} (${new Set(test.map((r) => r.raceId)).size} races)`);

// Ridge regression by the normal equations, features standardised on the fit set.
const k = FEATURES.length;
const sd = FEATURES.map((f) => Math.sqrt(mean(train.map((r) => r.x[f] ** 2))) || 1);
const X = (r: Row) => FEATURES.map((f, j) => r.x[f] / sd[j]);
const lambda = Number(process.env.OVERLAY_FIT_RIDGE ?? 1);
const A = Array.from({ length: k }, () => new Array(k).fill(0));
const b = new Array(k).fill(0);
for (const r of train) {
  const x = X(r);
  for (let i = 0; i < k; i++) { b[i] += x[i] * r.y; for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j]; }
}
for (let i = 0; i < k; i++) A[i][i] += lambda * train.length / 100;
// Gauss-Jordan.
const M = A.map((row, i) => [...row, b[i]]);
for (let c = 0; c < k; c++) {
  let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
  [M[c], M[p]] = [M[p], M[c]];
  const d = M[c][c] || 1e-9;
  for (let j = 0; j <= k; j++) M[c][j] /= d;
  for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j <= k; j++) M[r][j] -= f * M[c][j]; }
}
const beta = M.map((row) => row[k]);
const predict = (r: Row) => X(r).reduce((a, x, j) => a + x * beta[j], 0);

console.log("\nweights (points of run per standard deviation of the feature, within a race):");
for (const [j, f] of FEATURES.entries()) console.log(`  ${f.padEnd(11)} ${beta[j] >= 0 ? "+" : ""}${beta[j].toFixed(2)}`);

const r2 = (xs: Row[]) => { const yhat = xs.map(predict); const ss = xs.reduce((a, r, i) => a + (r.y - yhat[i]) ** 2, 0); const tot = xs.reduce((a, r) => a + r.y ** 2, 0); return 1 - ss / tot; };
console.log(`\nR² of the run against the field: fit ${r2(train).toFixed(3)}, test ${r2(test).toFixed(3)}`);
// Today's rating on the same footing: a one-feature fit of today's centred rating.
const todayFit = (xs: Row[]) => { const byRace = new Map<string, Row[]>(); for (const r of xs) byRace.set(r.raceId, [...(byRace.get(r.raceId) ?? []), r]); const pairs: [number, number][] = []; for (const g of byRace.values()) { const m = mean(g.map((r) => r.today)); for (const r of g) pairs.push([r.today - m, r.y]); } const sxy = pairs.reduce((a, [x, y]) => a + x * y, 0), sxx = pairs.reduce((a, [x]) => a + x * x, 0); const s = sxy / sxx; const ss = pairs.reduce((a, [x, y]) => a + (y - s * x) ** 2, 0), tot = pairs.reduce((a, [, y]) => a + y * y, 0); return { slope: s, r2: 1 - ss / tot }; };
console.log(`today's rating on the same footing: slope ${todayFit(train).slope.toFixed(2)} fit R² ${todayFit(train).r2.toFixed(3)}, test R² ${todayFit(test).r2.toFixed(3)}`);

// Race by race on the test days: who each rating puts on top, and the log loss of each as a softmax against the market.
const byRace = new Map<string, Row[]>();
for (const r of test) byRace.set(r.raceId, [...(byRace.get(r.raceId) ?? []), r]);
const ll = { fitted: 0, today: 0, market: 0 };
const top = { fitted: 0, today: 0, market: 0 };
const topAt12 = { fitted: 0, today: 0 };
let n = 0;
const bestT = (() => {
  // Temperature for the fitted rating, chosen on the fit set by log loss.
  const byR = new Map<string, Row[]>(); for (const r of train) byR.set(r.raceId, [...(byR.get(r.raceId) ?? []), r]);
  let best = { T: 8, ll: Infinity };
  for (const T of [2, 3, 4, 5, 6, 8, 10, 12]) {
    let s = 0, c = 0;
    for (const g of byR.values()) { const v = g.map(predict); const mx = Math.max(...v); const w = v.map((x) => Math.exp((x - mx) / T)); const z = w.reduce((a, b) => a + b, 0); for (const [i, r] of g.entries()) { if (r.won) { s -= Math.log(Math.max(1e-6, w[i] / z)); c++; } } }
    if (s / c < best.ll) best = { T, ll: s / c };
  }
  return best.T;
})();
console.log(`fitted rating's temperature: ${bestT} points per e-fold (today's is 8)`);
for (const g of byRace.values()) {
  if (!g.some((r) => r.won)) continue;
  n++;
  const fair = devig(g.map((r) => r.market)) as number[];
  const v = g.map(predict); const mx = Math.max(...v); const w = v.map((x) => Math.exp((x - mx) / bestT)); const z = w.reduce((a, b) => a + b, 0);
  const fp = g.map((r) => r.formProb); const fz = fp.reduce((a, b) => a + b, 0);
  const wi = g.findIndex((r) => r.won);
  ll.fitted -= Math.log(Math.max(1e-6, w[wi] / z)); ll.today -= Math.log(Math.max(1e-6, fp[wi] / fz)); ll.market -= Math.log(Math.max(1e-6, fair[wi]));
  const argmax = (xs: number[]) => xs.indexOf(Math.max(...xs));
  const tf = argmax(v), tt = argmax(fp), tm = argmax(fair);
  if (tf === wi) top.fitted++; if (tt === wi) top.today++; if (tm === wi) top.market++;
  if (g[tf].market >= 12) topAt12.fitted++; if (g[tt].market >= 12) topAt12.today++;
}
console.log(`\ntest days, ${n} races (rated runners only):`);
console.log(`  log loss   fitted ${(ll.fitted / n).toFixed(4)}   today ${(ll.today / n).toFixed(4)}   market ${(ll.market / n).toFixed(4)}`);
console.log(`  #1 won     fitted ${((100 * top.fitted) / n).toFixed(0)}%   today ${((100 * top.today) / n).toFixed(0)}%   market ${((100 * top.market) / n).toFixed(0)}%`);
console.log(`  #1 at $12+ fitted ${topAt12.fitted}   today ${topAt12.today}`);
writeFileSync("scripts/out/fit-rating.json", JSON.stringify({ split: SPLIT, lambda, features: FEATURES, sd, beta, temperature: bestT }, null, 2));
