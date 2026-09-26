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
  const { data } = await supabaseAdmin().from("tips").select("date, side, units, settled_at, finish_position").eq("source", "model").gte("date", window[0]);
  const count = new Map<string, number>(), bets = new Map<string, number>(), lays = new Map<string, number>(), units = new Map<string, number>();
  for (const t of (data ?? []) as { date: string; side: "back" | "lay"; units: number | null; settled_at: string | null; finish_position: number | null }[]) {
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

/** How the model is going against the results, a day at a time. */
export interface HealthDay {
  date: string;
  races: number;
  /** Market favourites that won, and how many the form said would. */
  favWon: number;
  favSaid: number;
  /** The form's top pick: how many won, how many the form said would. */
  topWon: number;
  topSaid: number;
  /** Favourites the form ranked fourth or worse. */
  favLow: number;
  bets: number;
  betUnits: number;
  lays: number;
  layUnits: number;
}

/**
 * The model against the results over the window, from the stored cards and
 * the ledger: is the form calibrated on its own pick, is it still
 * under-rating the favourite, and are the bets and lays paying at the price
 * they settle at. The numbers the 17 Sep 2026 recalibration was judged on,
 * so it can be judged again out of sample.
 */
export async function modelHealth(n: number): Promise<{ days: HealthDay[]; total: HealthDay }> {
  const window = days(n);
  const db = supabaseAdmin();
  const [{ data: cards }, { data: tips }] = await Promise.all([
    db.from("cards").select("date, card").gte("date", window[0]).order("date"),
    db.from("tips").select("date, side, units, settled_at").eq("source", "model").gte("date", window[0]).not("settled_at", "is", null).not("finish_position", "is", null),
  ]);
  const blank = (date: string): HealthDay => ({ date, races: 0, favWon: 0, favSaid: 0, topWon: 0, topSaid: 0, favLow: 0, bets: 0, betUnits: 0, lays: 0, layUnits: 0 });
  const byDay = new Map<string, HealthDay>();
  type Runner = { scratched?: boolean; marketPrice?: number; formPrice?: number; finishPosition?: number; ratings: { today: number; runs: number } };
  for (const c of (cards ?? []) as { date: string; card: { meetings: { races: { result?: number[]; runners: Runner[] }[] }[] } }[]) {
    const d = byDay.get(c.date) ?? blank(c.date);
    for (const m of c.card.meetings) for (const r of m.races) {
      if (!r.result?.length) continue;
      const live = r.runners.filter((x) => !x.scratched && x.marketPrice && x.formPrice && x.ratings.runs > 0);
      if (live.length < 4) continue;
      d.races++;
      const formSum = live.reduce((a, x) => a + 1 / x.formPrice!, 0);
      const said = (x: Runner) => 1 / x.formPrice! / formSum;
      const fav = [...live].sort((a, b) => a.marketPrice! - b.marketPrice!)[0];
      const byForm = [...live].sort((a, b) => b.ratings.today - a.ratings.today);
      d.favSaid += said(fav); if (fav.finishPosition === 1) d.favWon++;
      d.topSaid += said(byForm[0]); if (byForm[0].finishPosition === 1) d.topWon++;
      if (byForm.indexOf(fav) >= 3) d.favLow++;
    }
    byDay.set(c.date, d);
  }
  for (const t of (tips ?? []) as { date: string; side: "back" | "lay"; units: number | null }[]) {
    const d = byDay.get(t.date) ?? blank(t.date);
    if (t.side === "back") { d.bets++; d.betUnits += Number(t.units ?? 0); } else { d.lays++; d.layUnits += Number(t.units ?? 0); }
    byDay.set(t.date, d);
  }
  const list = [...byDay.values()].filter((d) => d.races > 0 || d.bets > 0 || d.lays > 0).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((a, d) => ({ ...a, races: a.races + d.races, favWon: a.favWon + d.favWon, favSaid: a.favSaid + d.favSaid, topWon: a.topWon + d.topWon, topSaid: a.topSaid + d.topSaid, favLow: a.favLow + d.favLow, bets: a.bets + d.bets, betUnits: a.betUnits + d.betUnits, lays: a.lays + d.lays, layUnits: a.layUnits + d.layUnits }), blank("total"));
  return { days: list, total };
}
