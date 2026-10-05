/** "shadow" is a model variant recorded alongside the live calls for testing: never published, never in the record. */
export type TipSource = "model" | "backtest" | "shadow";

/** Types shared with the Record component, no server imports. */

export type Period = "week" | "fortnight" | "month" | "year" | "all";
export const PERIODS: { id: Period; label: string; days?: number }[] = [
  { id: "week", label: "Last week", days: 7 },
  { id: "fortnight", label: "Last fortnight", days: 14 },
  { id: "month", label: "Last month", days: 30 },
  { id: "year", label: "Last year", days: 365 },
  { id: "all", label: "All time" },
];

export interface SideStats {
  /** Settled calls. */
  n: number;
  /** Bets won, or lays held. */
  hit: number;
  units: number;
  /** Units staked: one a call, a tenth on a Way Overlay; a lay's stake is the unit it wins. */
  staked: number;
  /** Units per unit staked, as a fraction: the profit on turnover. */
  roi: number;
  /** The share the prices said would land, as a fraction: a bet's chance of winning, a lay's of losing, at the price it settled at. */
  expected: number;
}

export interface RecordStats {
  period: Period;
  from?: string;
  bets: SideStats;
  lays: SideStats;
  net: number;
  /** Whether any backtest rows are inside the window. */
  backtest: boolean;
  /** Earliest settled date in the window. */
  since?: string;
}

/** A bet that won, for the Big winners row. */
export interface Winner {
  date: string;
  href: string;
  horse: string;
  race: string;
  /** The price it settled at, from the units it won. */
  price: number;
  units: number;
}

/** The whole book in one: calls, units and return on turnover across bets and lays. */
export function totals(r: RecordStats) {
  const staked = r.bets.staked + r.lays.staked;
  return { calls: r.bets.n + r.lays.n, units: r.net, roi: staked ? r.net / staked : 0 };
}
