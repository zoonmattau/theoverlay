import "server-only";

import { listMembers, type Member } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { PLANS, planById } from "@/lib/billing/plans";
import type { Series } from "@/lib/reports";

/** One plan's funnel over the window: from a click on the plan to money in. */
export interface PlanFunnel {
  id: string;
  name: string;
  /** Monthly price in dollars, 0 for passes. */
  price: number;
  clicks: number;
  checkouts: number;
  /** Trials started, or passes bought. */
  starts: number;
  /** First payments in the window. */
  paid: number;
  revenue_cents: number;
  /** Members on this plan with access right now. */
  active: number;
  trialling: number;
  /** Cancellations in the window. */
  cancelled: number;
  /** Rates per hundred, between steps. */
  clickToCheckout: number;
  checkoutToStart: number;
  startToPaid: number;
}

export interface MoneyReport {
  days: number;
  plans: PlanFunnel[];
  totals: PlanFunnel;
  /** Estimated monthly recurring revenue from active subscriptions, cents. */
  mrr_cents: number;
  /** Accounts made in the window, and how many confirmed their email. */
  signups: { made: number; confirmed: number; trials: number; paying: number };
  /** Sign-ups in the window by where they came from. */
  sources: { source: string; signups: number; confirmed: number; paying: number; revenue_cents: number }[];
  /** Bookie clicks in the window. */
  bookies: { bookie: string; clicks: number }[];
  /** Trial outcomes for trials that began in the window and have had time to end. */
  trials: { started: number; converted: number; ended: number; open: number };
  /** Clicks, checkouts, trials and payments by day, for the charts. */
  byDay: Series[];
  /** Plan clicks by hour of the day, Sydney time, 0 to 23. */
  byHour: number[];
  /** Plan clicks by day of the week, Monday first. */
  byWeekday: number[];
  /** The last 50 plan clicks and checkouts, newest first. */
  recent: { at: string; kind: string; plan: string | null; who: string; anonymous: boolean }[];
}

const sydneyDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const sydneyHour = (iso: string) => Number(new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Australia/Sydney" }).slice(0, 2)) % 24;
const sydneyWeekday = (iso: string) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(new Date(iso).toLocaleDateString("en-AU", { weekday: "short", timeZone: "Australia/Sydney" }));

function daySeries(key: string, title: string, format: Series["format"], days: string[], events: Ev[], value: (e: Ev) => number): Series {
  const byDay = new Map<string, number>();
  for (const e of events) byDay.set(sydneyDay(e.created_at), (byDay.get(sydneyDay(e.created_at)) ?? 0) + value(e));
  const points = days.map((date) => ({ date, value: Math.round((byDay.get(date) ?? 0) * 100) / 100 }));
  return { key, title, format, points, total: Math.round(points.reduce((a, p) => a + p.value, 0) * 100) / 100 };
}

type Ev = { user_id: string | null; kind: string; plan: string | null; amount_cents: number | null; meta: Record<string, unknown> | null; created_at: string };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function funnel(id: string, name: string, price: number, events: Ev[], members: Member[], now: number): PlanFunnel {
  const mine = events.filter((e) => (id === "passes" ? e.plan?.startsWith("passes") : e.plan === id));
  const clicks = mine.filter((e) => e.kind === "plan_click").length;
  const checkouts = mine.filter((e) => e.kind === "checkout_started").length;
  const starts =
    id === "passes"
      ? mine.filter((e) => e.kind === "checkout_completed").length
      : new Set(mine.filter((e) => e.kind === "subscription" && e.meta?.status === "trialing").map((e) => e.user_id)).size;
  const payments = mine.filter((e) => e.kind === "payment");
  const paid = new Set(payments.map((e) => e.user_id)).size;
  const revenue_cents = payments.reduce((a, e) => a + (e.amount_cents ?? 0), 0);
  const live = members.filter((m) => m.access_until && new Date(m.access_until).getTime() > now && !m.paused_at);
  const onPlan = id === "passes" ? [] : live.filter((m) => m.plan === id);
  const cancelled = id === "passes" ? 0 : new Set(mine.filter((e) => e.kind === "subscription" && (e.meta?.cancelAtPeriodEnd || e.meta?.status === "canceled")).map((e) => e.user_id)).size;
  return {
    id, name, price, clicks, checkouts, starts, paid, revenue_cents,
    active: onPlan.length,
    trialling: onPlan.filter((m) => m.subscription_status === "trialing").length,
    cancelled,
    clickToCheckout: pct(checkouts, clicks),
    checkoutToStart: pct(starts, checkouts),
    startToPaid: pct(paid, starts),
  };
}

/** Clicks, checkouts, trials, payments and cancellations by plan over the last n days, with the rates between them. */
export async function moneyReport(days: number): Promise<MoneyReport> {
  const now = Date.now();
  const since = new Date(now - days * 86400_000).toISOString();
  const [members, { data }] = await Promise.all([
    listMembers(),
    supabaseAdmin()
      .from("events")
      .select("user_id, kind, plan, amount_cents, meta, created_at")
      .gte("created_at", since)
      .in("kind", ["plan_click", "checkout_started", "checkout_completed", "subscription", "payment", "bookie_click"])
      .order("created_at", { ascending: false })
      .limit(20000),
  ]);
  const events = (data ?? []) as Ev[];

  const plans = [
    ...PLANS.map((p) => funnel(p.id, p.name, p.price, events, members, now)),
    funnel("passes", "Day passes", 0, events, members, now),
  ];
  const sum = (k: keyof PlanFunnel) => plans.reduce((a, p) => a + (p[k] as number), 0);
  const totals: PlanFunnel = {
    id: "all", name: "All", price: 0,
    clicks: sum("clicks"), checkouts: sum("checkouts"), starts: sum("starts"), paid: sum("paid"), revenue_cents: sum("revenue_cents"),
    active: sum("active"), trialling: sum("trialling"), cancelled: sum("cancelled"),
    clickToCheckout: pct(sum("checkouts"), sum("clicks")),
    checkoutToStart: pct(sum("starts"), sum("checkouts")),
    startToPaid: pct(sum("paid"), sum("starts")),
  };

  const live = members.filter((m) => m.access_until && new Date(m.access_until).getTime() > now && !m.paused_at && m.subscription_status === "active");
  const mrr_cents = live.reduce((a, m) => a + (planById(m.plan ?? undefined)?.price ?? 0) * 100, 0);

  const joined = members.filter((m) => m.created_at >= since);
  const paying = (m: Member) => Boolean(m.access_until && new Date(m.access_until).getTime() > now && m.subscription_status === "active");
  const signups = {
    made: joined.length,
    confirmed: joined.filter((m) => m.confirmed_at).length,
    trials: joined.filter((m) => m.subscribed_since).length,
    paying: joined.filter(paying).length,
  };
  const bySource = new Map<string, { signups: number; confirmed: number; paying: number; revenue_cents: number }>();
  for (const m of joined) {
    const key = (m.source ?? "signup").replace(/^affiliate:/, "affiliate ");
    const cur = bySource.get(key) ?? { signups: 0, confirmed: 0, paying: 0, revenue_cents: 0 };
    cur.signups += 1;
    if (m.confirmed_at) cur.confirmed += 1;
    if (paying(m)) cur.paying += 1;
    cur.revenue_cents += m.total_spent_cents ?? 0;
    bySource.set(key, cur);
  }
  const sources = [...bySource.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.signups - a.signups);

  const byBookie = new Map<string, number>();
  for (const e of events) if (e.kind === "bookie_click") byBookie.set(String(e.meta?.bookie ?? "?"), (byBookie.get(String(e.meta?.bookie ?? "?")) ?? 0) + 1);
  const bookies = [...byBookie.entries()].map(([bookie, clicks]) => ({ bookie, clicks })).sort((a, b) => b.clicks - a.clicks);

  // Trials: members whose subscription began in the window, and what became of them.
  const started = members.filter((m) => m.subscribed_since && m.subscribed_since >= since);
  const converted = started.filter((m) => m.subscription_status === "active").length;
  const open = started.filter((m) => m.subscription_status === "trialing").length;
  const trials = { started: started.length, converted, ended: started.length - converted - open, open };

  const window: string[] = [];
  for (let i = days - 1; i >= 0; i--) window.push(sydneyDay(new Date(now - i * 86400_000).toISOString()));
  const one = () => 1;
  const byDay = [
    daySeries("clicks", "Plan clicks", "count", window, events.filter((e) => e.kind === "plan_click"), one),
    daySeries("checkouts", "Checkouts opened", "count", window, events.filter((e) => e.kind === "checkout_started"), one),
    daySeries("starts", "Trials and passes", "count", window, events.filter((e) => (e.kind === "subscription" && e.meta?.status === "trialing") || e.kind === "checkout_completed"), one),
    daySeries("revenue", "Paid", "money", window, events.filter((e) => e.kind === "payment"), (e) => (e.amount_cents ?? 0) / 100),
  ];
  const byHour = Array<number>(24).fill(0);
  const byWeekday = Array<number>(7).fill(0);
  for (const e of events) {
    if (e.kind !== "plan_click") continue;
    byHour[sydneyHour(e.created_at)] += 1;
    const wd = sydneyWeekday(e.created_at);
    if (wd >= 0) byWeekday[wd] += 1;
  }
  const names = new Map(members.map((m) => [m.id, m.full_name || m.email || "a member"]));
  const recent = events
    .filter((e) => e.kind === "plan_click" || e.kind === "checkout_started" || e.kind === "checkout_completed")
    .slice(0, 50)
    .map((e) => ({ at: e.created_at, kind: e.kind, plan: e.plan, who: e.user_id ? (names.get(e.user_id) ?? "a member") : "a visitor", anonymous: !e.user_id }));

  return { days, plans, totals, mrr_cents, signups, sources, bookies, trials, byDay, byHour, byWeekday, recent };
}
