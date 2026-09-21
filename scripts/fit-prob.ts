// Fits the price: a conditional logit over each race's runners that turns the
// market's fair chance and the pieces of our rating into a win probability,
// with the weights estimated on the cached races rather than set by hand.
// The market is one input among the rest, so the fit says how much of the
// form the market already has and how much is left. Only the clean days
// count (from OVERLAY_PROB_CLEAN_FROM, 11 Sep 2026: before that the form was
// fetched after the race). Fit on the days before OVERLAY_FIT_SPLIT (default
// 2026-09-16), test on the days from it, then walk forward a day at a time
// from the third clean day so every race scored is priced by a fit that
// never saw it. Judge a feature set by the walk-forward log loss, not by the
// bets: twenty winners cannot tell two settings apart.
// npx tsx --tsconfig tsconfig.json scripts/fit-prob.ts
// OVERLAY_PROB_FEATURES=lnFair,dev OVERLAY_PROB_OUT=src/lib/model/price-fit.json npx tsx --tsconfig tsconfig.json scripts/fit-prob.ts
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";
import { devig } from "../src/lib/model/rate";
import { goingBand, goingSurplus } from "../src/lib/model/ratings";
import { barrierEffect } from "../src/lib/model/barriers";

const SPLIT = process.env.OVERLAY_FIT_SPLIT ?? "2026-09-16";
const LAMBDA = Number(process.env.OVERLAY_PROB_RIDGE ?? 1);
const BET_EDGE = Number(process.env.OVERLAY_BET_EDGE ?? 0.02);
const LAY_EDGE = Number(process.env.OVERLAY_LAY_EDGE ?? -0.06);
const sydney = (ms: number) => new Date(ms + 10 * 3600_000).toISOString().slice(0, 10);

const races = readdirSync(".formking-cache")
  .filter((f) => f.startsWith("race-"))
  .map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary)
  .filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds))
  .sort((a, b) => Number(a.date) - Number(b.date));

const ALL_FEATURES = [
  "lnFair", "dev", "clsDev", "late", "early", "sections", "shape", "jockey", "trainer", "streak", "fk", "fkRaw",
  "tempo", "going", "distance", "track", "weight", "fresh", "barrier", "trust", "lnRuns", "noForm", "devLow", "devHigh", "devFair", "goingWin", "gate",
] as const;
type Feature = (typeof ALL_FEATURES)[number];
/** The features to fit, from OVERLAY_PROB_FEATURES ("lnFair,dev,jockey"); all of them by default. */
export const PROB_FEATURES: readonly Feature[] = process.env.OVERLAY_PROB_FEATURES
  ? (process.env.OVERLAY_PROB_FEATURES.split(",").map((s) => s.trim()).filter((s): s is Feature => (ALL_FEATURES as readonly string[]).includes(s)))
  : ALL_FEATURES;
/** Days before this are left out of the fit and the test: their form was fetched after the race and fields beyond the run list saw later starts. */
const CLEAN_FROM = process.env.OVERLAY_PROB_CLEAN_FROM ?? "2026-09-11";

interface Row {
  date: string; raceId: string; tab: number; horse: string;
  x: number[];
  won: boolean;
  market: number; fair: number; layPrice: number; sp?: number;
  /** The live pipeline's rated chance, normalised over the runners kept. */
  rated: number;
  trust: number; runs: number; streak: number; conf: number; sat: boolean;
}

const rows: Row[] = [];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  const live = pub.runners.filter((x) => !x.scratched && x.marketPrice && x.marketPrice > 1);
  if (live.length < 4 || !live.some((x) => r.entries.find((e) => e.number === x.tabNumber)?.horseResult?.finishPosition === 1)) continue;
  const fair = devig(live.map((x) => x.marketPrice)) as number[];
  const ratedSum = live.reduce((a, x) => a + x.ratedProbability, 0);
  const formed = live.filter((x) => x.ratings.runs > 0);
  const meanToday = formed.length ? mean(formed.map((x) => x.ratings.today)) : 0;
  const meanClass = formed.length ? mean(formed.map((x) => x.ratings.class)) : 0;
  const date = sydney(Number(r.date));
  if (date < CLEAN_FROM) continue;
  const fks = live.map((x) => r.entries.find((e) => e.number === x.tabNumber)?.ratings?.peak12m ?? 0).filter((v) => v > 0);
  const meanFk = fks.length ? mean(fks) : 0;
  const sat = new Date(Number(r.date) + 10 * 3600_000).getUTCDay() === 6;
  const band = goingBand(r.going);
  const liveEntries = r.entries.filter((e) => !e.scratched);
  for (const [i, x] of live.entries()) {
    const e = r.entries.find((y) => y.number === x.tabNumber)!;
    const g = x.ratings;
    const f = g.factors as Record<string, number>;
    const has = g.runs > 0;
    const dev = has ? (g.today - meanToday) / 8 : 0;
    const v: Record<Feature, number> = {
      lnFair: Math.log(Math.max(1e-4, fair[i])),
      dev,
      clsDev: has ? (g.class - meanClass) / 8 : 0,
      late: has ? g.late - g.class : 0,
      early: has ? g.early - g.class : 0,
      sections: f.sections ?? 0, shape: f.shape ?? 0, jockey: f.jockey ?? 0, trainer: f.trainer ?? 0, streak: f.streak ?? 0, fk: f.market ?? 0,
      fkRaw: e.ratings?.peak12m && fks.length ? (e.ratings.peak12m - meanFk) / 10 : 0,
      tempo: f.tempo ?? 0, going: f.going ?? 0, distance: f.distance ?? 0, track: f.track ?? 0, weight: f.weight ?? 0, fresh: f.fresh ?? 0, barrier: f.barrier ?? 0,
      trust: has ? g.trust : 0, lnRuns: Math.log1p(g.runs), noForm: has ? 0 : 1,
      // The rating's distance from the field on a rating that cannot be trusted.
      devLow: has ? dev * (1 - g.trust) : 0,
      devHigh: has ? dev * g.trust : 0,
      devFair: has ? dev * Math.log(Math.max(1e-4, fair[i])) : 0,
      goingWin: goingSurplus(e.form?.goingForm, band),
      gate: barrierEffect(r.trackName, r.distance, liveEntries.filter((o) => o.barrier < e.barrier).length + 1, liveEntries.length),
    };
    rows.push({
      date, raceId: r.raceId, tab: x.tabNumber, horse: x.horseName, x: PROB_FEATURES.map((k) => v[k]),
      won: e.horseResult?.finishPosition === 1, market: x.marketPrice!, fair: fair[i], layPrice: x.layPrice ?? Math.round((1.04 / fair[i]) * 100) / 100, sp: e.horseResult?.startingPrice || undefined,
      rated: x.ratedProbability / ratedSum, trust: g.trust, runs: g.runs, streak: f.streak ?? 0, conf: pub.confidence, sat,
    });
  }
}

const byRace = (xs: Row[]) => { const m = new Map<string, Row[]>(); for (const r of xs) m.set(r.raceId, [...(m.get(r.raceId) ?? []), r]); return [...m.values()]; };
const days = [...new Set(rows.map((r) => r.date))].sort();
console.log(`features: ${PROB_FEATURES.join(", ")}
${rows.length} runners in ${byRace(rows).length} races over ${days.length} days: ${days[0]} to ${days[days.length - 1]} (days before ${CLEAN_FROM} left out)`);

/** Conditional logit by Newton's method with a ridge penalty; features standardised on the fit set. */
function fit(train: Row[], lambda = LAMBDA) {
  const k = PROB_FEATURES.length;
  const sd = PROB_FEATURES.map((_, j) => Math.sqrt(mean(train.map((r) => r.x[j] ** 2))) || 1);
  const X = (r: Row) => r.x.map((v, j) => v / sd[j]);
  const groups = byRace(train).map((g) => ({ xs: g.map(X), w: g.findIndex((r) => r.won) }));
  let beta = new Array(k).fill(0);
  // The market's own weight is never shrunk: the penalty is for the form's pieces.
  const pen = PROB_FEATURES.map((f) => (f === "lnFair" ? 0 : lambda));
  const ll = (b: number[]) => {
    let s = -0.5 * b.reduce((a, v, j) => a + pen[j] * v * v, 0);
    for (const g of groups) { const z = g.xs.map((x) => x.reduce((a, v, j) => a + v * b[j], 0)); const mx = Math.max(...z); const lse = mx + Math.log(z.reduce((a, v) => a + Math.exp(v - mx), 0)); s += z[g.w] - lse; }
    return s;
  };
  let cur = ll(beta);
  for (let iter = 0; iter < 30; iter++) {
    const grad = beta.map((v, j) => -pen[j] * v);
    const H = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? -pen[i] : 0)));
    for (const g of groups) {
      const z = g.xs.map((x) => x.reduce((a, v, j) => a + v * beta[j], 0));
      const mx = Math.max(...z); const ex = z.map((v) => Math.exp(v - mx)); const tot = ex.reduce((a, b) => a + b, 0); const p = ex.map((v) => v / tot);
      const xbar = new Array(k).fill(0);
      for (const [i, x] of g.xs.entries()) for (let j = 0; j < k; j++) xbar[j] += p[i] * x[j];
      for (let j = 0; j < k; j++) grad[j] += g.xs[g.w][j] - xbar[j];
      for (const [i, x] of g.xs.entries()) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) H[a][b] -= p[i] * (x[a] - xbar[a]) * (x[b] - xbar[b]);
    }
    // Solve H d = grad, then step beta -= d (H is negative definite).
    const M = H.map((row, i) => [...row, grad[i]]);
    for (let c = 0; c < k; c++) {
      let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c] || 1e-9; for (let j = 0; j <= k; j++) M[c][j] /= d;
      for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j <= k; j++) M[r][j] -= f * M[c][j]; }
    }
    const step = M.map((row) => row[k]);
    let t = 1, next = beta, nll = -Infinity;
    for (let h = 0; h < 8; h++) { next = beta.map((v, j) => v - t * step[j]); nll = ll(next); if (nll >= cur) break; t /= 2; }
    const gain = nll - cur; beta = next; cur = nll;
    if (Math.abs(gain) < 1e-7) break;
  }
  const predict = (g: Row[]) => { const z = g.map((r) => X(r).reduce((a, v, j) => a + v * beta[j], 0)); const mx = Math.max(...z); const ex = z.map((v) => Math.exp(v - mx)); const tot = ex.reduce((a, b) => a + b, 0); return ex.map((v) => v / tot); };
  // Standard errors from the observed information at the fit, penalty out.
  const I = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const g of groups) {
    const z = g.xs.map((x) => x.reduce((a, v, j) => a + v * beta[j], 0));
    const mx = Math.max(...z); const ex = z.map((v) => Math.exp(v - mx)); const tot = ex.reduce((a, b) => a + b, 0); const p = ex.map((v) => v / tot);
    const xbar = new Array(k).fill(0);
    for (const [i, x] of g.xs.entries()) for (let j = 0; j < k; j++) xbar[j] += p[i] * x[j];
    for (const [i, x] of g.xs.entries()) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) I[a][b] += p[i] * (x[a] - xbar[a]) * (x[b] - xbar[b]);
  }
  const M = I.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-9; for (let j = 0; j < 2 * k; j++) M[c][j] /= d;
    for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * k; j++) M[r][j] -= f * M[c][j]; }
  }
  const se = M.map((row, i) => Math.sqrt(Math.max(0, row[k + i])));
  return { beta, sd, se, predict };
}

const train = rows.filter((r) => r.date < SPLIT);
const test = rows.filter((r) => r.date >= SPLIT);
console.log(`fit on ${byRace(train).length} races before ${SPLIT}, test on ${byRace(test).length} races from it`);
const model = fit(train);
console.log("\nweights (log-odds per standard deviation of the feature):");
for (const [j, f] of PROB_FEATURES.entries()) console.log(`  ${f.padEnd(9)} ${model.beta[j] >= 0 ? "+" : ""}${model.beta[j].toFixed(3)}  (se ${model.se[j].toFixed(3)})`);

interface Scored extends Row { p: number }
const score = (xs: Row[], predict: (g: Row[]) => number[]): Scored[] => byRace(xs).flatMap((g) => { const p = predict(g); return g.map((r, i) => ({ ...r, p: p[i] })); });

function report(label: string, xs: Scored[]) {
  const groups = byRace(xs) as Scored[][];
  const n = groups.length;
  const ll = (p: (r: Scored) => number) => -groups.reduce((a, g) => a + Math.log(Math.max(1e-6, p(g.find((r) => r.won)!))), 0) / n;
  const top = (p: (r: Scored) => number) => groups.filter((g) => [...g].sort((a, b) => p(b) - p(a))[0].won).length;
  console.log(`\n${label}: ${n} races`);
  console.log(`  log loss   fitted ${ll((r) => r.p).toFixed(4)}   rated ${ll((r) => r.rated).toFixed(4)}   market ${ll((r) => r.fair).toFixed(4)}`);
  console.log(`  #1 won     fitted ${top((r) => r.p)} (${((100 * top((r) => r.p)) / n).toFixed(0)}%)   rated ${top((r) => r.rated)}   market ${top((r) => r.fair)}`);
  const fav = groups.map((g) => [...g].sort((a, b) => a.market - b.market)[0]);
  console.log(`  favourite: ${fav.filter((r) => r.won).length} won, fitted said ${fav.reduce((a, r) => a + r.p, 0).toFixed(0)}, rated ${fav.reduce((a, r) => a + r.rated, 0).toFixed(0)}, market ${fav.reduce((a, r) => a + r.fair, 0).toFixed(0)}`);
  for (const [name, p] of [["fitted", (r: Scored) => r.p], ["rated", (r: Scored) => r.rated]] as const) {
    const ok = xs.filter((r) => r.conf >= 0.35 && r.runs > 0);
    const bets = ok.filter((r) => r.trust >= 0.3 && p(r) - 1 / r.market >= BET_EDGE && p(r) >= 0.08 && r.market <= 26);
    const lays = ok.filter((r) => r.trust >= 0.4 && r.streak <= 0 && p(r) - 1 / r.layPrice <= LAY_EDGE && r.layPrice <= 12);
    const u = bets.reduce((a, r) => a + (r.won ? r.market - 1 : -1), 0);
    const usp = bets.reduce((a, r) => a + (r.won ? (r.sp ?? r.market) - 1 : -1), 0);
    const lu = lays.reduce((a, r) => a + (r.won ? -(r.layPrice - 1) : 0.95), 0);
    const said = bets.reduce((a, r) => a + p(r), 0);
    console.log(`  ${name.padEnd(6)} bets ${String(bets.length).padStart(3)}, won ${String(bets.filter((r) => r.won).length).padStart(3)} (said ${said.toFixed(0)}), ${u >= 0 ? "+" : ""}${u.toFixed(1)}u (${((100 * u) / Math.max(1, bets.length)).toFixed(0)}%) at market, ${usp >= 0 ? "+" : ""}${usp.toFixed(1)}u at SP | lays ${lays.length}, won ${lays.filter((r) => r.won).length}, ${lu >= 0 ? "+" : ""}${lu.toFixed(1)}u (${((100 * lu) / Math.max(1, lays.length)).toFixed(0)}%)`);
    const bands: [number, number][] = [[1, 4], [4, 6], [6, 10], [10, 27]];
    console.log(`         by price: ` + bands.map(([lo, hi]) => { const b = bets.filter((r) => r.market >= lo && r.market < hi); const bu = b.reduce((a, r) => a + (r.won ? r.market - 1 : -1), 0); return `$${lo}-${hi} ${b.length}/${b.filter((r) => r.won).length} ${bu >= 0 ? "+" : ""}${bu.toFixed(1)}u`; }).join("  "));
  }
}

report("fit set (in sample)", score(train, model.predict));
report("test days", score(test, model.predict));
report("test Saturdays", score(test.filter((r) => r.sat), model.predict));
report("test midweek", score(test.filter((r) => !r.sat), model.predict));

// Walk forward: each day from the third priced by a fit on every day before it.
const walked: Scored[] = [];
for (const d of days.slice(2)) {
  const m = fit(rows.filter((r) => r.date < d));
  walked.push(...score(rows.filter((r) => r.date === d), m.predict));
}
report(`walk-forward from ${days[2]} (each day fitted on the days before it)`, walked);
// The ledger that price would have written, day by day, under the live bet and lay rules.
console.log(`\nday-by-day ledger under the walk-forward price (bets at ${BET_EDGE} edge, lays at ${LAY_EDGE}):`);
let runU = 0, runSp = 0, runLay = 0;
for (const d of days.slice(2)) {
  const xs = walked.filter((r) => r.date === d && r.conf >= 0.35 && r.runs > 0);
  const bets = xs.filter((r) => r.trust >= 0.3 && r.p - 1 / r.market >= BET_EDGE && r.p >= 0.08 && r.market <= 26);
  const lays = xs.filter((r) => r.trust >= 0.4 && r.streak <= 0 && r.p - 1 / r.layPrice <= LAY_EDGE && r.layPrice <= 12);
  const u = bets.reduce((a, r) => a + (r.won ? r.market - 1 : -1), 0);
  const usp = bets.reduce((a, r) => a + (r.won ? (r.sp ?? r.market) - 1 : -1), 0);
  const lu = lays.reduce((a, r) => a + (r.won ? -(r.layPrice - 1) : 0.95), 0);
  runU += u; runSp += usp; runLay += lu;
  const f = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`.padStart(6);
  console.log(`  ${d}  races ${String(byRace(walked.filter((r) => r.date === d)).length).padStart(3)}  bets ${String(bets.length).padStart(2)} won ${String(bets.filter((r) => r.won).length).padStart(2)}  ${f(u)}u  (${f(usp)}u at SP)  running ${f(runU)}u / ${f(runSp)}u at SP  | lays ${String(lays.length).padStart(2)} won ${lays.filter((r) => r.won).length} ${f(lu)}u running ${f(runLay)}u  | bets: ${bets.map((r) => `${r.horse} $${r.market}${r.won ? " WON" : ""}`).join(", ")}`);
}
report("walk-forward Saturdays", walked.filter((r) => r.sat));
report("walk-forward midweek", walked.filter((r) => !r.sat));

// The fit on everything, for the model to price with.
const all = fit(rows);
console.log(`\nweights on all ${byRace(rows).length} races:`);
for (const [j, f] of PROB_FEATURES.entries()) console.log(`  ${f.padEnd(9)} ${all.beta[j] >= 0 ? "+" : ""}${all.beta[j].toFixed(3)}  (se ${all.se[j].toFixed(3)}); per unit ${(all.beta[j] / all.sd[j]).toFixed(3)}`);
// OVERLAY_PROB_OUT=src/lib/model/price-fit.json installs it as the price the model uses (features lnFair and dev).
const OUT = process.env.OVERLAY_PROB_OUT ?? "scripts/out/fit-prob.json";
writeFileSync(OUT, JSON.stringify({ fitted: days[days.length - 1], from: days[0], races: byRace(rows).length, lambda: LAMBDA, features: PROB_FEATURES, sd: all.sd, beta: all.beta }, null, 2));
console.log(`\nwrote ${OUT} from all ${byRace(rows).length} races`);
