export type TipSource = "model" | "backtest";

/** Types shared with the Record component, no server imports. */

export type Period = "week" | "month" | "year" | "all";
export const PERIODS: { id: Period; label: string; days?: number }[] = [
  { id: "week", label: "Last week", days: 7 },
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
  /** Units per unit staked, as a fraction. */
  roi: number;
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
