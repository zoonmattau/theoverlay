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
const DEFAULT_TEMPERATURE = Number(process.env.OVERLAY_TEMPERATURE ?? 8);

/**
 * How much we trust the market over the model, 0-1.
 *
 * The market is very hard to beat. Shrinking toward it costs us the races where
 * we are right and loud, but saves us from the far more common case where we
 * are wrong and loud. Fit this on the historical extract rather than guessing ,
 * see scripts/backtest.ts.
 */
const DEFAULT_MARKET_WEIGHT = Number(process.env.OVERLAY_MARKET_WEIGHT ?? 0.5);
/**
 * The meld: where we and the market agree the market gets its base weight,
 * and the further apart we are the more it gets, up to OUTLIER_WEIGHT. The
 * scale is in log-odds, so a gap of one scale (roughly a price ratio of two)
 * takes the weight about two thirds of the way from base to the ceiling.
 * A $8 rating against an $18 market is where we are most often the ones who
 * are wrong, and this is what pulls it in without hiding the disagreement.
 */
const OUTLIER_WEIGHT = Number(process.env.OVERLAY_OUTLIER_WEIGHT ?? 0.8);
const OUTLIER_SCALE = Number(process.env.OVERLAY_OUTLIER_SCALE ?? 1.5);
/**
 * The same ramp on the lay side, where we have the horse longer than the
 * market. The form is right about the direction there and wrong about the
 * size: over the resulted races in the cache the horses we laid won 67 where
 * we said 48 and the market said 74, and the chance we took off them landed
 * on the rest of the field as edge that did not pay. Set with
 * scripts/sweep-lay-meld.ts.
 */
const LAY_OUTLIER_WEIGHT = Number(process.env.OVERLAY_LAY_OUTLIER_WEIGHT ?? 0.8);
/**
 * Short favourites are where the form knows least and the market most: over
 * the resulted races in the cache the horses under $2 won 55 where the meld
 * said 43 and the market itself said 48. So on the lay side the market's
 * ceiling climbs with the market's own chance, from the lay ceiling at
 * SHORT_FROM to SHORT_WEIGHT at SHORT_TO and above. Set with
 * scripts/sweep-short.ts.
 */
const SHORT_WEIGHT = Number(process.env.OVERLAY_SHORT_WEIGHT ?? 0.8);
/** Sharpening on the de-vigged market for the favourite-longshot bias, 1 for none. Set with scripts/sweep-short.ts. */
const FL_POWER = Number(process.env.OVERLAY_FL_POWER ?? 1);
const SHORT_FROM = 0.25;
const SHORT_TO = 0.5;
/**
 * A lay is struck on the exchange, not at a bookmaker's best quote, and the
 * exchange price sits above it: over 76 settled lays the Betfair SP ran 12%
 * over the best bookmaker price and 4% over the de-vigged fair price. So a
 * lay's price is the fair price plus this, and its edge is read against it.
 */
const LAY_OVER_FAIR = Number(process.env.OVERLAY_LAY_OVER_FAIR ?? 1.04);
/**
 * Where the market's ceiling goes for a rating with no trust at all: the
 * meld's ceiling climbs from the usual one toward this as the trust falls.
 * At the usual ceiling (0.8) the trust does nothing. 0.95 from
 * scripts/sweep-caps.ts on 17 Sep 2026: the rated price's log loss falls
 * from 0.2803 to 0.2801 and keeps falling to 1.0, so a rating on nothing
 * should be the market; bets 228 at +14% to 208 at +14%, lays 193 to 177.
 */
const NO_TRUST_CEILING = Number(process.env.OVERLAY_NO_TRUST_CEILING ?? 0.95);

export interface RateInput {
  key: string;
  /** Our rating for today, in benchmark points. See ratings.ts. */
  rating?: number;
  /** How much that rating can be trusted, 0-1; 1 when absent. */
  trust?: number;
  /** The exchange's best lay on offer now, when BetWatch has it; a lay is struck here instead of the estimate. */
  layQuote?: number;
  /** Best available market price at publish time. */
  marketPrice?: number;
  scratched?: boolean;
}

export interface RateOutput {
  key: string;
  /** Our price from the form alone, before the meld with the market. */
  modelPrice?: number;
  probability: number;
  ratedPrice: number;
  marketPrice?: number;
  /** Our win chance minus the market's implied chance, in probability points. */
  edge?: number;
  /** What a lay is struck at: the de-vigged fair price plus the exchange's margin over it. */
  layPrice?: number;
  /** Our win chance minus the chance the lay price implies; a lay wants this well under nought. */
  layEdge?: number;
}

export interface RateResult {
  runners: RateOutput[];
  /** 0-1. Falls when ratings are sparse or the field is unreadable. */
  confidence: number;
}

export function rateRace(
  inputs: RateInput[],
  opts: { temperature?: number; marketWeight?: number; outlierWeight?: number; layOutlierWeight?: number; outlierScale?: number } = {},
): RateResult {
  const temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
  const marketWeight = opts.marketWeight ?? DEFAULT_MARKET_WEIGHT;
  const outlierWeight = Math.max(marketWeight, opts.outlierWeight ?? OUTLIER_WEIGHT);
  const layOutlierWeight = Math.max(marketWeight, opts.layOutlierWeight ?? LAY_OUTLIER_WEIGHT);
  const outlierScale = opts.outlierScale ?? OUTLIER_SCALE;

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
    // The market's say grows with the size of the disagreement, toward one
    // ceiling when we have the horse shorter than the market and another
    // when we have it longer, the lay side, where the form is right about
    // the direction more often than about the size.
    const gap = logit(model) - logit(market);
    // The lay-side ceiling climbs toward SHORT_WEIGHT as the market's chance climbs toward SHORT_TO.
    const short = Math.min(1, Math.max(0, (market - SHORT_FROM) / (SHORT_TO - SHORT_FROM)));
    const layCeiling = layOutlierWeight + (Math.max(layOutlierWeight, SHORT_WEIGHT) - layOutlierWeight) * short;
    const base = gap >= 0 ? outlierWeight : layCeiling;
    // A rating we cannot trust leans harder on the market, up to NO_TRUST_CEILING with no trust at all.
    const trust = r.trust ?? 1;
    const ceiling = base + Math.max(0, NO_TRUST_CEILING - base) * (1 - trust);
    const w = weight === 0 ? 0 : weight + (ceiling - weight) * (1 - Math.exp(-Math.abs(gap) / outlierScale));
    return sigmoid(w * logit(market) + (1 - w) * logit(model));
  });

  const total = blended.reduce((a, b) => a + b, 0);
  const normalised = blended.map((p) => p / total);
  const modelTotal = modelProbs.reduce((a, b) => a + b, 0);

  const runners: RateOutput[] = live.map((r, i) => {
    const probability = normalised[i];
    const ratedPrice = roundPrice(1 / probability);
    // Edge is our win chance minus the market's: a $4 rating against a $5
    // market is 25% less 20%, an edge of five points.
    const edge =
      r.marketPrice !== undefined ? round4(probability - 1 / r.marketPrice) : undefined;
    const fair = marketProbs[i];
    const layPrice = r.layQuote && r.layQuote > 1 ? r.layQuote : fair !== undefined && fair > 0 ? roundPrice(LAY_OVER_FAIR / fair) : undefined;
    const layEdge = layPrice !== undefined ? round4(probability - 1 / layPrice) : undefined;
    // The form alone, before the market had a say.
    const modelPrice = r.rating === undefined ? undefined : roundPrice(modelTotal / modelProbs[i]);
    return { key: r.key, probability, ratedPrice, modelPrice, marketPrice: r.marketPrice, edge, layPrice, layEdge };
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

  // The overround out, then the favourite-longshot bias: punters underbet
  // short favourites and overbet roughies, so the fair market still has the
  // $1.60 shot winning more often than it says. A power a little over one
  // moves that chance back where it belongs.
  const fair = raw.map((p) => Math.pow(Math.pow(p, k), FL_POWER));
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
/** Bookmaker-style rounding: 5 cent steps under $3, 10 cent steps above. */
export function roundPrice(p: number): number {
  const step = p < 3 ? 0.05 : 0.1;
  return Math.round(Math.round(p / step) * step * 100) / 100;
}
const round4 = (n: number) => Math.round(n * 10000) / 10000;
