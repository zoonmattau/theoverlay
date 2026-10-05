import "server-only";

import { arrivalSource } from "@/lib/arrival";

import { listMembers, type Member } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { PLANS, planById } from "@/lib/billing/plans";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";
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
  signups: { made: number; confirmed: number; trials: number; trialling: number; paying: number };
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
  /** New accounts and trial sign-ups by day, and this week against last, to see if it is growing. */
  growth: { accounts: Series; trials: Series; week: { accounts: [number, number]; trials: [number, number] } };
  /** The last 50 plan clicks and checkouts, newest first. */
  recent: { at: string; kind: string; plan: string | null; who: string; anonymous: boolean; userId?: string }[];
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

/** A trial beginning: the subscription made on trial, not a later change to one (a cancellation booked, a card added). */
const trialStart = (e: Ev) => e.kind === "subscription" && e.meta?.status === "trialing" && (e.meta?.event === undefined || e.meta.event === "customer.subscription.created");

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function funnel(id: string, name: string, price: number, events: Ev[], members: Member[], now: number): PlanFunnel {
  // A checkout on a longer term is logged as everyday_year and its trial as everyday: both are this plan.
  const mine = events.filter((e) => (id === "passes" ? e.plan?.startsWith("passes") : e.plan === id || e.plan?.startsWith(`${id}_`)));
  // One person is one click and one checkout however many times they press it: signed in by
  // account, signed out by the day they did it, which is as close to a person as we can get.
  const people = (kind: string) => new Set(mine.filter((e) => e.kind === kind).map((e) => e.user_id ?? `anon:${sydneyDay(e.created_at)}:${e.plan}`)).size;
  const clicks = people("plan_click");
  const checkouts = people("checkout_started");
  // Passes have no trial: a purchase is a payment, counted under paid.
  const starts = id === "passes" ? 0 : new Set(mine.filter(trialStart).map((e) => e.user_id)).size;
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
    // Trials only come from plans, so only plan checkouts count against them.
    checkoutToStart: pct(sum("starts"), plans.reduce((a, p) => a + (p.id === "passes" ? 0 : p.checkouts), 0)),
    startToPaid: pct(plans.reduce((a, p) => a + (p.id === "passes" ? 0 : p.paid), 0), sum("starts")),
  };

  const live = members.filter((m) => m.access_until && new Date(m.access_until).getTime() > now && !m.paused_at && m.subscription_status === "active");
  const mrr_cents = live.reduce((a, m) => a + (planById(m.plan ?? undefined)?.price ?? 0) * 100, 0);

  const joined = members.filter((m) => m.created_at >= since);
  const paying = (m: Member) => Boolean(m.access_until && new Date(m.access_until).getTime() > now && m.subscription_status === "active");
  const signups = {
    made: joined.length,
    confirmed: joined.filter((m) => m.confirmed_at).length,
    trials: joined.filter((m) => m.subscribed_since).length,
    trialling: joined.filter((m) => m.access_until && new Date(m.access_until).getTime() > now && m.subscription_status === "trialing").length,
    paying: joined.filter(paying).length,
  };
  const bySource = new Map<string, { signups: number; confirmed: number; paying: number; revenue_cents: number }>();
  for (const m of joined) {
    // Invites and affiliates name themselves; anyone else is grouped by the site that sent them.
    const key = m.source?.startsWith("affiliate:") ? m.source.replace(/^affiliate:/, "affiliate ") : m.source === "invite" ? "invite" : arrivalSource(m);
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
    daySeries("starts", "Trials and passes", "count", window, events.filter((e) => trialStart(e) || e.kind === "checkout_completed"), one),
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
    .map((e) => ({ at: e.created_at, kind: e.kind, plan: e.plan, who: e.user_id ? (names.get(e.user_id) ?? "a member") : "a visitor", anonymous: !e.user_id, userId: e.user_id ?? undefined }));

  // Growth: accounts by the day they were made, trials by the day the subscription began (admins left out).
  const people = members.filter((m) => !m.is_admin);
  const count = (key: string, title: string, dates: string[]) => {
    const by = new Map<string, number>();
    for (const d of dates) by.set(d, (by.get(d) ?? 0) + 1);
    const points = window.map((date) => ({ date, value: by.get(date) ?? 0 }));
    return { key, title, format: "count" as const, points, total: points.reduce((a, p) => a + p.value, 0) };
  };
  const accountDays = people.map((m) => sydneyDay(m.created_at));
  const trialDays = people.filter((m) => m.subscribed_since).map((m) => sydneyDay(m.subscribed_since!));
  // The last 7 whole-or-part days against the 7 before them.
  const weekOf = (dates: string[]): [number, number] => {
    const edge = (k: number) => sydneyDay(new Date(now - k * 86400_000).toISOString());
    return [dates.filter((d) => d > edge(7)).length, dates.filter((d) => d > edge(14) && d <= edge(7)).length];
  };
  const growth = {
    accounts: count("accounts", "New accounts", accountDays),
    trials: count("trials", "Trial sign-ups", trialDays),
    week: { accounts: weekOf(accountDays), trials: weekOf(trialDays) },
  };

  return { days, plans, totals, mrr_cents, signups, sources, bookies, trials, byDay, byHour, byWeekday, growth, recent };
}

/** A charge Stripe will try on a live subscription: a trial turning into its first bill, or a renewal. */
export interface UpcomingCharge {
  /** Unix seconds: when the charge will be tried. */
  at: number;
  userId?: string;
  who: string;
  plan: string;
  kind: "first bill" | "renewal" | "retry";
  amount_cents: number;
}

/**
 * Every charge due in the next `days` days, soonest first. Read from Stripe,
 * the subscription's own next invoice previewed, so discounts, terms and the
 * half-price first month come through as Stripe will bill them. A
 * subscription booked to end before its next bill is left out.
 */
export async function upcomingCharges(days = 14): Promise<{ charges: UpcomingCharge[]; conversion?: { ended: number; paid: number; rate: number }; error?: string }> {
  if (!stripeConfigured()) return { charges: [], error: "Stripe is not set up here." };
  try {
    const [charges, conversion] = await Promise.all([chargesWithin(days), trialConversion()]);
    return { charges, conversion };
  } catch (err) {
    // A restricted key needs read access to subscriptions, customers and invoices.
    console.error("[money] upcoming", err);
    return { charges: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function chargesWithin(days: number): Promise<UpcomingCharge[]> {
  const until = Math.floor(Date.now() / 1000) + days * 86400;
  const subs = [];
  for await (const s of stripe().subscriptions.list({ status: "all", limit: 100 })) {
    if (s.status === "trialing" || s.status === "active" || s.status === "past_due") subs.push(s);
  }
  const custIds = subs.map((s) => (typeof s.customer === "string" ? s.customer : s.customer.id));
  const { data: profiles } = await supabaseAdmin().from("profiles").select("id, email, full_name, stripe_customer_id").in("stripe_customer_id", custIds);
  const byCustomer = new Map(((profiles ?? []) as { id: string; email: string | null; full_name: string | null; stripe_customer_id: string }[]).map((p) => [p.stripe_customer_id, p]));
  const out = await Promise.all(
    subs.map(async (s): Promise<UpcomingCharge | null> => {
      const p = byCustomer.get(typeof s.customer === "string" ? s.customer : s.customer.id);
      const planId = s.metadata?.plan ?? "subscription";
      const base = { userId: p?.id, who: p?.full_name || p?.email || "a member", plan: `${planById(planId)?.name ?? planId}${termOf(s.items.data[0]?.price.recurring)}` };
      // A card that failed: the open invoice, on the day Stripe next tries it, not the bill after.
      if (s.status === "past_due") {
        const open = (await stripe().invoices.list({ subscription: s.id, status: "open", limit: 1 })).data[0];
        if (!open?.next_payment_attempt || open.next_payment_attempt > until) return null;
        return { ...base, at: open.next_payment_attempt, kind: "retry", amount_cents: open.amount_due };
      }
      const at = s.status === "trialing" && s.trial_end ? s.trial_end : (s.items.data[0]?.current_period_end ?? 0);
      if (!at || at > until) return null;
      if (s.cancel_at_period_end || (s.cancel_at && s.cancel_at <= at)) return null;
      const preview = await stripe().invoices.createPreview({ subscription: s.id }).catch(() => null);
      return { ...base, at, kind: s.status === "trialing" ? "first bill" : "renewal", amount_cents: preview?.amount_due ?? 0 };
    }),
  );
  return out.filter((c): c is UpcomingCharge => c !== null).sort((a, b) => a.at - b.at);
}

/** ", yearly" or ", quarterly" after a plan's name; nothing for a monthly bill. */
function termOf(r?: { interval: string; interval_count: number } | null): string {
  if (!r) return "";
  if (r.interval === "year") return r.interval_count === 1 ? ", yearly" : `, every ${r.interval_count} years`;
  if (r.interval === "month" && r.interval_count === 3) return ", quarterly";
  if (r.interval === "month" && r.interval_count > 1) return `, every ${r.interval_count} months`;
  if (r.interval === "week") return r.interval_count === 1 ? ", weekly" : `, every ${r.interval_count} weeks`;
  return "";
}

/**
 * Of the trials that have run their course, how many paid: a trial whose end
 * has passed counts once, and it converted if its subscription has a paid
 * invoice for more than nothing. A trial cancelled early counts as ended.
 */
export async function trialConversion(): Promise<{ ended: number; paid: number; rate: number }> {
  const nowS = Math.floor(Date.now() / 1000);
  let ended = 0, paid = 0;
  for await (const s of stripe().subscriptions.list({ status: "all", limit: 100 })) {
    if (!s.trial_end) continue;
    const over = s.trial_end <= nowS || s.status === "canceled" || s.status === "incomplete_expired";
    if (!over) continue;
    ended++;
    const inv = await stripe().invoices.list({ subscription: s.id, status: "paid", limit: 10 });
    if (inv.data.some((i) => i.amount_paid > 0)) paid++;
  }
  return { ended, paid, rate: ended ? paid / ended : 0 };
}
