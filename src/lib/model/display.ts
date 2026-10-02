/**
 * Ratings shown in benchmark points.
 *
 * The engine rates on the feed's class scale since 17 Sep 2026 (a maiden
 * about 77, BM90 about 90, open 96: RR_A + RR_B * points in ratings.ts).
 * Every number a member reads goes back through these two, so a BM64 horse
 * reads about 64 again. Thresholds that pick a colour or a phrase keep
 * comparing engine numbers; only what is printed is converted.
 */
export const FEED_A = 56;
export const FEED_B = 0.4;

/** An absolute rating (class, today, a par, a run) in benchmark points. */
export const bm = (v: number) => (v - FEED_A) / FEED_B;

/** A gap between two ratings (a factor, v par, a trend) in benchmark points. */
export const bmGap = (d: number) => d / FEED_B;
