/**
 * Fixed odds deductions for a late scratching, from Sportsbet's published
 * Schedule of Deductions for Win bets (helpcentre.sportsbet.com.au, "What Are
 * Deductions?", read 5 Oct 2026). The band is the scratched runner's price
 * when it came out; the deduction, in cents in the dollar, comes off the whole
 * return of a bet struck before the scratching. Several scratchings add up.
 */
const WIN: [price: number, cents: number][] = [
  [1.01, 76], [1.02, 75], [1.04, 73], [1.08, 72], [1.12, 71], [1.18, 69], [1.22, 67], [1.24, 65], [1.35, 62],
  [1.4, 60], [1.45, 56], [1.5, 55], [1.55, 53], [1.6, 51], [1.65, 49], [1.7, 47], [1.75, 46], [1.8, 45],
  [1.85, 44], [1.9, 43], [1.95, 41], [2, 40], [2.1, 39], [2.15, 37], [2.2, 36], [2.3, 35], [2.35, 34],
  [2.4, 33], [2.45, 31], [2.6, 30], [2.7, 29], [2.8, 28], [2.9, 27], [3, 26], [3.1, 25], [3.2, 24],
  [3.3, 23], [3.4, 22], [3.6, 21], [3.7, 20], [3.9, 19], [4.2, 18], [4.6, 16], [4.8, 15], [5.5, 13],
  [6, 12], [6.5, 11], [7, 10], [7.5, 9], [8, 8], [9, 7], [10, 6], [11, 5], [13, 4], [15, 3], [18, 2],
  [31, 0],
];

/** The most a scratching can take off a bet, so a short-priced pair never leaves a return of nothing. */
const CAP = 75;

/** Cents in the dollar off a win bet for one runner scratched at this price. */
export function winDeduction(price: number): number {
  if (!(price > 1)) return 0;
  let cents = 0;
  for (const [from, c] of WIN) {
    if (price + 1e-9 < from) break;
    cents = c;
  }
  return cents;
}

/**
 * The share of a price kept after the scratchings that came out after a
 * call was made: 0.61 when they add to 39 cents. One when none did, or when
 * a scratched runner has no price on record (out before the markets opened).
 */
export function keptAfter(scratched: { scratchPrice?: number; scratchedAt?: string }[], calledAt?: string): number {
  const since = calledAt ? new Date(calledAt).getTime() : -Infinity;
  const cents = scratched
    .filter((x) => x.scratchPrice && x.scratchedAt && new Date(x.scratchedAt).getTime() > since)
    .reduce((a, x) => a + winDeduction(x.scratchPrice!), 0);
  return 1 - Math.min(cents, CAP) / 100;
}

/** A price after deductions, never under $1.01. */
export const deducted = (price: number, kept: number) => (kept >= 1 ? price : Math.max(1.01, Math.round(price * kept * 100) / 100));
