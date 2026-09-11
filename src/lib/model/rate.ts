/**
 * The rating model.
 *
 * Turns our benchmark ratings into probabilities and rated prices. This has to
 * be a real transformation, not a relabelling of Form King, both because a thin
 * wrapper breaches the licence and because a thin wrapper has no edge.
 *
 * Pipeline:
 *   ratings          -> model probabilities   (exponential / softmax)
 *   market prices    -> market probabilities  (de-vigged, power method)
 *   the two          -> blended probabilities (shrunk toward the market)
 *   blended          -> rated price + edge
 */

/**
 * Benchmark points that correspond to an e-fold change in win odds. Set on
 * a live card (scripts/calibrate.ts) so the model's spread matches the
 * market's; 8 points is roughly 2.7x the odds.
 */
const DEFAULT_TEMPERATURE = 8;

/**
 * How much we trust the market over the model, 0-1.
 *
 * The market is very hard to beat. Shrinking toward it costs us the races where
 * we are right and loud, but saves us from the far more common case where we
 * are wrong and loud. Fit this on the historical extract rather than guessing ,
 * see scripts/backtest.ts.
 */
const DEFAULT_MARKET_WEIGHT = 0.8;

export interface RateInput {
  key: string;
  /** Our rating for today, in benchmark points. See ratings.ts. */
  rating?: number;
  /** Best available market price at publish time. */
  marketPrice?: number;
  scratched?: boolean;
}

export interface RateOutput {
  key: string;
  probability: number;
  ratedPrice: number;
  marketPrice?: number;
  /** Our win chance minus the market's implied chance, in probability points. */
  edge?: number;
}

export interface RateResult {
  runners: RateOutput[];
  /** 0-1. Falls when ratings are sparse or the field is unreadable. */
  confidence: number;
}

export function rateRace(
  inputs: RateInput[],
  opts: { temperature?: number; marketWeight?: number } = {},
): RateResult {
  const temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
  const marketWeight = opts.marketWeight ?? DEFAULT_MARKET_WEIGHT;

  const live = inputs.filter((r) => !r.scratched);
  if (live.length === 0) return { runners: [], confidence: 0 };

  const modelProbs = ratingsToProbabilities(live, temperature);
  const marketProbs = devig(live.map((r) => r.marketPrice));

  // Only lean on the market where we actually have a price for every runner.
  const haveFullMarket = marketProbs.every((p) => p !== undefined);
  const weight = haveFullMarket ? marketWeight : 0;

  // Blend in log-odds, not probability: averaging probabilities lets the
  // model's long-shot tails swamp the market, and it is the tails where the
  // market is least often wrong.
  const blended = live.map((r, i) => {
    const model = modelProbs[i];
    const market = marketProbs[i];
    if (market === undefined) return model;
    // A runner we could not rate is priced off the market alone.
    if (r.rating === undefined) return market;
    return sigmoid(weight * logit(market) + (1 - weight) * logit(model));
  });

  const total = blended.reduce((a, b) => a + b, 0);
  const normalised = blended.map((p) => p / total);

  const runners: RateOutput[] = live.map((r, i) => {
    const probability = normalised[i];
    const ratedPrice = round2(1 / probability);
    // Edge is our win chance minus the market's: a $4 rating against a $5
    // market is 25% less 20%, an edge of five points.
    const edge =
      r.marketPrice !== undefined ? round4(probability - 1 / r.marketPrice) : undefined;
    return { key: r.key, probability, ratedPrice, marketPrice: r.marketPrice, edge };
  });

  return { runners, confidence: confidenceOf(live, modelProbs) };
}

/**
 * Exponential model: a runner's weight is exp(rating / temperature), so a fixed
 * rating gap means a fixed odds ratio regardless of where it sits in the field.
 * Runners with no rating fall back to the field's median so they neither carry
 * nor lose implied chance.
 */
export function ratingsToProbabilities(
  inputs: RateInput[],
  temperature = DEFAULT_TEMPERATURE,
): number[] {
  const rated = inputs.map((r) => r.rating).filter((r): r is number => r !== undefined);
  const fallback = rated.length ? median(rated) : 0;

  // Subtract the max before exponentiating so large ratings can't overflow.
  const values = inputs.map((r) => r.rating ?? fallback);
  const max = Math.max(...values);
  const weights = values.map((v) => Math.exp((v - max) / temperature));
  const total = weights.reduce((a, b) => a + b, 0);

  return weights.map((w) => w / total);
}

/**
 * Strip the bookmaker's margin from a set of prices using the power method:
 * find k such that sum(p_i ^ k) === 1, where p_i is the raw implied
 * probability. Favours longshots less than naive proportional scaling, which
 * matters because roughies are where this product makes or loses its name.
 */
export function devig(prices: (number | undefined)[]): (number | undefined)[] {
  const idx = prices
    .map((p, i) => ({ p, i }))
    .filter((x): x is { p: number; i: number } => typeof x.p === "number" && x.p > 1);

  if (idx.length === 0) return prices.map(() => undefined);

  const raw = idx.map((x) => 1 / x.p);
  const overround = raw.reduce((a, b) => a + b, 0);
  if (overround <= 0) return prices.map(() => undefined);

  let lo = 0.5;
  let hi = 1.5;
  let k = 1;
  for (let iter = 0; iter < 60; iter++) {
    k = (lo + hi) / 2;
    const sum = raw.reduce((a, p) => a + Math.pow(p, k), 0);
    if (sum > 1) lo = k;
    else hi = k;
  }

  const fair = raw.map((p) => Math.pow(p, k));
  const total = fair.reduce((a, b) => a + b, 0);

  const out: (number | undefined)[] = prices.map(() => undefined);
  idx.forEach((x, j) => {
    out[x.i] = fair[j] / total;
  });
  return out;
}

/**
 * Confidence drops when we are missing ratings, and when the model sees the
 * race as a scramble. A flat probability distribution means we have no opinion,
 * and saying so is worth more than inventing one.
 */
function confidenceOf(inputs: RateInput[], probs: number[]): number {
  const coverage = inputs.filter((r) => r.rating !== undefined).length / inputs.length;

  // Normalised entropy: 0 = one standout, 1 = every runner equal.
  const entropy = -probs.reduce((a, p) => (p > 0 ? a + p * Math.log(p) : a), 0);
  const maxEntropy = Math.log(inputs.length);
  const decisiveness = maxEntropy > 0 ? 1 - entropy / maxEntropy : 0;

  return round4(clamp(coverage * 0.5 + decisiveness * 1.6, 0, 1));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const logit = (p: number) => Math.log(clamp(p, 1e-4, 1 - 1e-4) / (1 - clamp(p, 1e-4, 1 - 1e-4)));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
