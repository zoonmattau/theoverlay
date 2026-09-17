/**
 * How a ranking is cut. Plain data, shared by the server that runs the
 * query and the form that sets it. Everything is a list, so a jockey can be
 * read over 1400 and 1600 metres, on Good 4 to Soft 6 but not Soft 7, in
 * NSW and Victoria, in the last seven days.
 */
export interface HubFilter {
  states?: string[];
  tracks?: string[];
  /** Going numbers, 1 to 10. */
  goings?: number[];
  /** Exact distances in metres. */
  distances?: number[];
  /** A key from DISTANCE_BANDS, for a link from a distance's page; the form uses exact distances. */
  band?: string;
  /** A key from PERIODS, 7d to all. */
  period?: string;
}

export const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

/** Shortest first. */
export const PERIODS: { key: string; label: string; days?: number }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "14d", label: "14 days", days: 14 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "6m", label: "6 months", days: 182 },
  { key: "12m", label: "12 months", days: 365 },
  { key: "all", label: "All time" },
];

/** The going scale, one chip each. */
export const GOINGS: { n: number; label: string; band: "good" | "soft" | "heavy" }[] = [
  { n: 1, label: "Firm 1", band: "good" }, { n: 2, label: "Firm 2", band: "good" },
  { n: 3, label: "Good 3", band: "good" }, { n: 4, label: "Good 4", band: "good" },
  { n: 5, label: "Soft 5", band: "soft" }, { n: 6, label: "Soft 6", band: "soft" }, { n: 7, label: "Soft 7", band: "soft" },
  { n: 8, label: "Heavy 8", band: "heavy" }, { n: 9, label: "Heavy 9", band: "heavy" }, { n: 10, label: "Heavy 10", band: "heavy" },
];

/** The distances run often enough to pick, one chip each. */
export const DISTANCES = [800, 900, 1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350, 1400, 1450, 1500, 1550, 1600, 1650, 1700, 1800, 1900, 2000, 2100, 2200, 2400, 2500, 2600, 2800, 3000, 3200];

/** The same bands the sectional ratings use. */
export const DISTANCE_BANDS: { key: string; label: string; lo: number; hi: number }[] = [
  { key: "sprint", label: "Sprint, under 1150m", lo: 0, hi: 1150 },
  { key: "1200", label: "1150 to 1349m", lo: 1150, hi: 1350 },
  { key: "1400", label: "1350 to 1649m", lo: 1350, hi: 1650 },
  { key: "1800", label: "1650 to 2049m", lo: 1650, hi: 2050 },
  { key: "staying", label: "2050m and up", lo: 2050, hi: 10000 },
];

/** A distance's band key, for a link from a distance to the rankings over it. */
export const bandOfDistance = (d: number) => DISTANCE_BANDS.find((b) => d >= b.lo && d < b.hi)?.key ?? "";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean);
const nums = (v: string | string[] | undefined) => list(v).map(Number).filter((n) => Number.isFinite(n));

/** The filter out of a page's query. */
export function filterFrom(sp: Record<string, string | string[] | undefined>): HubFilter {
  return {
    states: list(sp.state), tracks: list(sp.track), goings: nums(sp.going), distances: nums(sp.distance),
    band: str(sp.band) || undefined, period: str(sp.period) || undefined,
  };
}

export const filterActive = (f: HubFilter) => Boolean(f.states?.length || f.tracks?.length || f.goings?.length || f.distances?.length || f.band || (f.period && f.period !== "all"));

/** A query string for the filter, for links between pages. */
export function filterQuery(f: HubFilter, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams();
  if (f.states?.length) p.set("state", f.states.join(","));
  if (f.tracks?.length) p.set("track", f.tracks.join(","));
  if (f.goings?.length) p.set("going", f.goings.join(","));
  if (f.distances?.length) p.set("distance", f.distances.join(","));
  if (f.band) p.set("band", f.band);
  if (f.period && f.period !== "all") p.set("period", f.period);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.size ? `?${p}` : "";
}

/** The filter in words, for a heading: "NSW · 1400m, 1600m · Good 4, Soft 5, Soft 6 · last 7 days". */
export function filterWords(f: HubFilter): string {
  const parts: string[] = [];
  if (f.states?.length) parts.push(f.states.join(", "));
  if (f.tracks?.length) parts.push(f.tracks.length <= 3 ? f.tracks.join(", ") : `${f.tracks.length} tracks`);
  if (f.distances?.length) parts.push(f.distances.map((d) => `${d}m`).join(", "));
  else if (f.band) parts.push(DISTANCE_BANDS.find((b) => b.key === f.band)?.label.toLowerCase() ?? f.band);
  if (f.goings?.length) parts.push(f.goings.map((n) => GOINGS.find((g) => g.n === n)?.label ?? String(n)).join(", "));
  const period = PERIODS.find((p) => p.key === f.period);
  if (period?.days) parts.push(`last ${period.label.toLowerCase()}`);
  return parts.join(" · ");
}
