import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";

/**
 * Daily series for the admin reports, one number per calendar day (Sydney)
 * over the window, zero-filled so charts line up.
 */

export interface Point {
  /** yyyy-mm-dd */
  date: string;
  value: number;
}

export interface Series {
  key: string;
  title: string;
  /** How to print a value. */
  format: "count" | "money" | "units";
  /** Positive and negative values mean different things, so colour splits at zero. */
  diverging?: boolean;
  points: Point[];
  total: number;
  /** What the total is, after the figure; "in the window" when unset. */
  totalLabel?: string;
  /** A level (members, accounts) rather than a flow: a bucket shows its last day, not a sum. */
  level?: boolean;
  /** What each point covers; a day when unset. */
  by?: Bucket;
}

export type Bucket = "day" | "week" | "month" | "year";
export const BUCKETS: Bucket[] = ["day", "week", "month", "year"];

/** The first day of the bucket a yyyy-mm-dd falls in: the Monday, the 1st, or 1 January. */
function bucketStart(date: string, by: Bucket): string {
  if (by === "month") return `${date.slice(0, 7)}-01`;
  if (by === "year") return `${date.slice(0, 4)}-01-01`;
  if (by === "week") {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  return date;
}

/**
 * A day series rolled into weeks, months or years, each point dated by its bucket's first day:
 * a flow adds up, a level keeps the bucket's last day. The total is unchanged.
 */
export function bucketed(s: Series, by: Bucket): Series {
  if (by === "day") return s;
  const out = new Map<string, number>();
  for (const p of s.points) {
    const k = bucketStart(p.date, by);
    out.set(k, s.level ? p.value : Math.round(((out.get(k) ?? 0) + p.value) * 100) / 100);
  }
  return { ...s, by, points: [...out].map(([date, value]) => ({ date, value })) };
}

function days(n: number): string[] {
  const out: string[] = [];
  const end = new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86400_000);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

function series(key: string, title: string, format: Series["format"], window: string[], byDay: Map<string, number>, diverging = false): Series {
  const points = window.map((date) => ({ date, value: Math.round((byDay.get(date) ?? 0) * 100) / 100 }));
  return { key, title, format, diverging, points, total: Math.round(points.reduce((a, p) => a + p.value, 0) * 100) / 100 };
}

/** The first day of an n-day window ending today, Sydney time: what the charts start on. */
export const windowStart = (n: number) => days(n)[0];

const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/** Days from the first account to today, inclusive, for the all-time window. */
export async function daysSinceLaunch(): Promise<number> {
  const { data } = await supabaseAdmin().from("profiles").select("created_at").order("created_at").limit(1).maybeSingle();
  const first = data?.created_at ? new Date(data.created_at).getTime() : Date.now();
  return Math.max(1, Math.ceil((Date.now() - first) / 86400_000) + 1);
}

/** Every row a query returns, a thousand at a time: one read stops at 1,000 and a month of calls is more (12 Oct 2026, the 30-day line read +82.5u against +110.1u). */
async function every<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await page(from, from + 999);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return out;
  }
}

/** The model's calls by day: how many, and units at level stakes once settled. */
export async function modelTipSeries(n: number): Promise<Series[]> {
  const window = days(n);
  const data = await every((a, b) => supabaseAdmin().from("tips").select("date, side, units, settled_at, finish_position").eq("source", "model").gte("date", window[0]).order("id").range(a, b));
  const count = new Map<string, number>(), bets = new Map<string, number>(), lays = new Map<string, number>(), units = new Map<string, number>();
  for (const t of data as { date: string; side: "back" | "lay"; units: number | null; settled_at: string | null; finish_position: number | null }[]) {
    // A void (off the card, or scratched) was never a call on Today's tips.
    if (t.settled_at && t.finish_position === null) continue;
    add(count, t.date, 1);
    add(t.side === "back" ? bets : lays, t.date, 1);
    if (t.settled_at) add(units, t.date, Number(t.units ?? 0));
  }
  return [
    series("tips", "Calls published", "count", window, count),
    series("bets", "Bets", "count", window, bets),
    series("lays", "Lays", "count", window, lays),
    series("units", "Units, level stakes", "units", window, units, true),
  ];
}

/** Tipsters' calls by day, all tipsters together. */
export async function tipsterTipSeries(n: number): Promise<{ all: Series[]; byTipster: { name: string; code: string; series: Series[] }[] }> {
  const db = supabaseAdmin();
  const window = days(n);
  const [tips, { data: affs }] = await Promise.all([
    every((a, b) => db.from("creator_tips").select("affiliate_id, date, units, settled_at").gte("date", window[0]).order("id").range(a, b)),
    db.from("affiliates").select("id, name, code").not("user_id", "is", null),
  ]);
  const rows = tips as { affiliate_id: string; date: string; units: number | null; settled_at: string | null }[];
  const build = (xs: typeof rows) => {
    const count = new Map<string, number>(), units = new Map<string, number>();
    for (const t of xs) {
      add(count, t.date, 1);
      if (t.settled_at) add(units, t.date, Number(t.units ?? 0));
    }
    return [series("tipster_tips", "Tipster calls", "count", window, count), series("tipster_units", "Tipster units", "units", window, units, true)];
  };
  return {
    all: build(rows),
    byTipster: ((affs ?? []) as { id: string; name: string; code: string }[]).map((a) => ({ name: a.name, code: a.code, series: build(rows.filter((r) => r.affiliate_id === a.id)) })),
  };
}
