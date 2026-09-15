import "server-only";

import { listMembers, type Member } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { PLANS, planById } from "@/lib/billing/plans";

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
  /** Sign-ups in the window by where they came from. */
  sources: { source: string; signups: number; paying: number; revenue_cents: number }[];
  /** Bookie clicks in the window. */
  bookies: { bookie: string; clicks: number }[];
  /** Trial outcomes for trials that began in the window and have had time to end. */
  trials: { started: number; converted: number; ended: number; open: number };
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

  const recent = members.filter((m) => m.created_at >= since);
  const bySource = new Map<string, { signups: number; paying: number; revenue_cents: number }>();
  for (const m of recent) {
    const key = (m.source ?? "signup").replace(/^affiliate:/, "affiliate ");
    const cur = bySource.get(key) ?? { signups: 0, paying: 0, revenue_cents: 0 };
    cur.signups += 1;
    if (m.access_until && new Date(m.access_until).getTime() > now && m.subscription_status === "active") cur.paying += 1;
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

  return { days, plans, totals, mrr_cents, sources, bookies, trials };
}
