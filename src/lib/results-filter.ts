/**
 * The Results page's filters, shared with the CSV download so a download is
 * exactly what the page shows: the period and side tabs, and on Every call the
 * result, the track and a price band. Plain values, read from search params.
 */
export const PRICE_BANDS = [
  { id: "short", label: "Under $4", test: (p: number) => p < 4 },
  { id: "mid", label: "$4 to $10", test: (p: number) => p >= 4 && p < 10 },
  { id: "long", label: "$10 and up", test: (p: number) => p >= 10 },
] as const;

export const RESULT_FILTERS = [
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
] as const;

export interface ResultsFilter {
  /** "all", "30" or "7" days. */
  period: string;
  /** "all", "bets" or "lays". */
  side: string;
  result?: string;
  track?: string;
  price?: string;
}

const one = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v[0] : (v ?? undefined));

/** The filter in a set of search params, unknown values dropped. */
export function readFilter(get: (k: string) => string | string[] | null | undefined): ResultsFilter {
  const period = ["30", "7"].includes(one(get("period")) ?? "") ? one(get("period"))! : "all";
  const side = ["bets", "lays"].includes(one(get("side")) ?? "") ? one(get("side"))! : "all";
  const result = RESULT_FILTERS.some((r) => r.id === one(get("result"))) ? one(get("result")) : undefined;
  const price = PRICE_BANDS.some((b) => b.id === one(get("price"))) ? one(get("price")) : undefined;
  const track = one(get("track"))?.slice(0, 60) || undefined;
  return { period, side, result, track, price };
}

/** The filter as search params, defaults left out. */
export function filterParams(f: ResultsFilter): URLSearchParams {
  const q = new URLSearchParams();
  if (f.period !== "all") q.set("period", f.period);
  if (f.side !== "all") q.set("side", f.side);
  if (f.result) q.set("result", f.result);
  if (f.track) q.set("track", f.track);
  if (f.price) q.set("price", f.price);
  return q;
}

/** Whether a settled call passes the filter. `today` is the Sydney date, yyyy-mm-dd. */
export function passes(c: { date: string; side: string; units: number | string | null; track: string; market_price: number | string }, f: ResultsFilter, today: string): boolean {
  if (f.period !== "all") {
    const from = new Date(new Date(`${today}T12:00:00Z`).getTime() - Number(f.period) * 86400_000).toISOString().slice(0, 10);
    if (c.date < from) return false;
  }
  if (f.side === "bets" && c.side !== "back") return false;
  if (f.side === "lays" && c.side !== "lay") return false;
  const u = Number(c.units ?? 0);
  if (f.result === "won" && !(u > 0)) return false;
  if (f.result === "lost" && !(u <= 0)) return false;
  if (f.track && c.track !== f.track) return false;
  const band = PRICE_BANDS.find((b) => b.id === f.price);
  if (band && !band.test(Number(c.market_price))) return false;
  return true;
}
