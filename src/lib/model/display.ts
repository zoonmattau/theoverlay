/**
 * Ratings shown in benchmark points.
 *
 * The engine rates on the feed's class scale since 17 Sep 2026 (a maiden
 * about 77, BM90 about 90, open 96: RR_A + RR_B * points in ratings.ts).
 * Every number a member reads goes back through these, so a BM64 horse
 * reads about 64 again. Thresholds that pick a colour or a phrase keep
 * comparing engine numbers; only what is printed is converted.
 */
export const FEED_A = 56;
export const FEED_B = 0.4;

/**
 * Engine points between a race's par and its average runner. A run is the
 * race's strength less the lengths it was beaten, so the winner sits at par
 * and the field below it: 4.4 on average over the 55 races of 2 Oct 2026.
 * A runner's rating is lifted by that much before it is shown, so a typical
 * BM58 runner reads 58 against a par of 58.
 */
export const FIELD_LIFT = 4.4;

/** A runner's rating (class, today, a run, a sectional) in benchmark points. */
export const bm = (v: number) => (v + FIELD_LIFT - FEED_A) / FEED_B;

/** A race's par in benchmark points: the class it is run at. */
export const bmPar = (p: number) => (p - FEED_A) / FEED_B;

/** A gap between two runner ratings (a factor, a trend, v the field) in benchmark points. */
export const bmGap = (d: number) => d / FEED_B;

/** A runner's rating against its race's par, in benchmark points. */
export const bmVsPar = (v: number, par: number) => bm(v) - bmPar(par);
