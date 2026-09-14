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
}

const sydneyDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

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

const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/** Sign-ups, payments and emails by day. */
export async function growthSeries(n: number): Promise<Series[]> {
  const db = supabaseAdmin();
  const window = days(n);
  const since = new Date(Date.now() - (n + 1) * 86400_000).toISOString();
  const [{ data: profiles }, { data: events }] = await Promise.all([
    db.from("profiles").select("created_at").gte("created_at", since),
    db.from("events").select("kind, amount_cents, meta, created_at").in("kind", ["payment", "tips_email", "tipster_email"]).gte("created_at", since),
  ]);
  const signups = new Map<string, number>(), money = new Map<string, number>(), payments = new Map<string, number>(), emails = new Map<string, number>();
  for (const p of (profiles ?? []) as { created_at: string }[]) add(signups, sydneyDay(p.created_at), 1);
  for (const e of (events ?? []) as { kind: string; amount_cents: number | null; meta: { sent?: number } | null; created_at: string }[]) {
    const d = sydneyDay(e.created_at);
    if (e.kind === "payment") {
      add(money, d, (e.amount_cents ?? 0) / 100);
      add(payments, d, 1);
    } else add(emails, d, Number(e.meta?.sent ?? 0));
  }
  return [
    series("signups", "Sign-ups", "count", window, signups),
    series("payments", "Payments", "count", window, payments),
    series("revenue", "Revenue", "money", window, money),
    series("emails", "Emails sent", "count", window, emails),
  ];
}

/** The model's calls by day: how many, and units at level stakes once settled. */
export async function modelTipSeries(n: number): Promise<Series[]> {
  const window = days(n);
  const { data } = await supabaseAdmin().from("tips").select("date, side, units, settled_at").eq("source", "model").gte("date", window[0]);
  const count = new Map<string, number>(), bets = new Map<string, number>(), lays = new Map<string, number>(), units = new Map<string, number>();
  for (const t of (data ?? []) as { date: string; side: "back" | "lay"; units: number | null; settled_at: string | null }[]) {
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
  const [{ data: tips }, { data: affs }] = await Promise.all([
    db.from("creator_tips").select("affiliate_id, date, units, settled_at").gte("date", window[0]),
    db.from("affiliates").select("id, name, code").not("user_id", "is", null),
  ]);
  const rows = (tips ?? []) as { affiliate_id: string; date: string; units: number | null; settled_at: string | null }[];
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
