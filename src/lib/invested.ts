import "server-only";

import { cacheLife } from "next/cache";

import { metaDailyBudget, metaSpend } from "@/lib/ads/meta-spend";
import { supabaseAdmin } from "@/lib/billing/access";
import { stripe } from "@/lib/billing/stripe";
import { commissionByDay } from "@/lib/owed";

/**
 * Money in against money out since the first day: revenue from Stripe's
 * balance (charges less refunds, less Stripe's card and Billing fees),
 * against Meta's ad spend plus the costs typed in on the Money tab (a
 * monthly line counts on its day each month until stopped) and affiliates'
 * commission, a cost the day the payment it comes from lands. Both as running
 * totals by Sydney day, so the page can show where they cross.
 */
export const SINCE = "2026-09-01";

export interface Cost {
  id: string;
  date: string;
  amount_cents: number;
  what: string;
  monthly: boolean;
  stopped: string | null;
}

export interface Invested {
  /** Running totals by day, dollars. */
  days: { date: string; invested: number; revenue: number }[];
  revenue: { gross: number; fees: number; net: number };
  /** other includes commission; commission is also given on its own. */
  invested: { ads: number; other: number; commission: number; total: number };
  costs: Cost[];
  /** The calendar month so far, Sydney time, dollars. */
  month: {
    /** "2026-10". */
    month: string;
    /** Every cost other than Meta that falls in the month, the whole month's, not just to today. */
    fixed: { date: string; what: string; amount: number }[];
    adsSoFar: number;
    /** What the live Meta campaigns are budgeted a day, to carry the month out. */
    adsPerDay: number;
    /** Days after today left in the month. */
    daysLeft: number;
    /** Revenue after fees landed this month. */
    inSoFar: number;
  };
  /** Why the ad spend is missing, if it is. */
  adsMissing?: string;
}

const DAY = 86400_000;
const sydneyDay = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

/** Every Stripe balance movement since SINCE, by day: charges, refunds and fees. Cached an hour. */
async function stripeByDay(): Promise<Record<string, { gross: number; fees: number }>> {
  "use cache";
  cacheLife("hours");
  const out: Record<string, { gross: number; fees: number }> = {};
  const since = Math.floor(new Date(`${SINCE}T00:00:00+10:00`).getTime() / 1000);
  for await (const t of stripe().balanceTransactions.list({ created: { gte: since }, limit: 100 })) {
    const day = sydneyDay(t.created * 1000);
    // Stripe's own charges (Billing and the like) come as separate stripe_fee movements, negative.
    if (t.type === "stripe_fee") {
      // Its own fee (GST on the charge) comes off too: the net is what left the balance.
      (out[day] ??= { gross: 0, fees: 0 }).fees += -t.net / 100;
      continue;
    }
    if (!["charge", "payment", "refund", "payment_refund"].includes(t.type)) continue;
    const d = (out[day] ??= { gross: 0, fees: 0 });
    d.gross += t.amount / 100;
    d.fees += t.fee / 100;
  }
  return out;
}

/** The days a cost counts on up to `to`: its date, or every month from it while it runs. */
function costDays(c: Cost, to: string): string[] {
  if (!c.monthly) return c.date <= to ? [c.date] : [];
  const out: string[] = [];
  const [y, m, d] = c.date.split("-").map(Number);
  for (let i = 0; ; i++) {
    const at = new Date(Date.UTC(y, m - 1 + i, Math.min(d, 28)));
    const iso = at.toISOString().slice(0, 10);
    if (iso > to || (c.stopped && iso.slice(0, 7) > c.stopped.slice(0, 7))) break;
    out.push(iso);
  }
  return out;
}

export async function invested(): Promise<Invested> {
  const today = sydneyDay(Date.now());
  const [ads, byDay, { data }, commission, budget] = await Promise.all([
    metaSpend(SINCE, today),
    stripeByDay().catch(() => ({}) as Record<string, { gross: number; fees: number }>),
    supabaseAdmin().from("costs").select("id, date, amount_cents, what, monthly, stopped").order("date", { ascending: false }),
    commissionByDay().catch(() => []),
    metaDailyBudget(),
  ]);
  const costs = (data ?? []) as Cost[];
  const spend = new Map<string, number>();
  let adsMissing: string | undefined;
  if (ads === undefined) adsMissing = "Meta is not connected yet, so ad spend is not counted.";
  else if ("error" in ads) adsMissing = `Meta did not answer, so ad spend is not counted: ${ads.error}`;
  else for (const s of ads) spend.set(s.date, s.spend);
  const other = new Map<string, number>();
  for (const c of costs) for (const d of costDays(c, today)) other.set(d, (other.get(d) ?? 0) + c.amount_cents / 100);
  // The affiliate's share of a payment is theirs, not ours: a cost the day it lands.
  const owedOut = commission.filter((c) => c.date >= SINCE && c.date <= today);
  for (const c of owedOut) other.set(c.date, (other.get(c.date) ?? 0) + c.amount);

  const days: Invested["days"] = [];
  let inv = 0, rev = 0, adsTotal = 0, otherTotal = 0, gross = 0, fees = 0;
  for (let t = new Date(`${SINCE}T12:00:00Z`).getTime(); sydneyDay(t) <= today; t += DAY) {
    const d = sydneyDay(t);
    const a = spend.get(d) ?? 0, o = other.get(d) ?? 0, s = byDay[d] ?? { gross: 0, fees: 0 };
    adsTotal += a;
    otherTotal += o;
    gross += s.gross;
    fees += s.fees;
    inv += a + o;
    rev += s.gross - s.fees;
    days.push({ date: d, invested: Math.round(inv * 100) / 100, revenue: Math.round(rev * 100) / 100 });
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const month = today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const fixed = costs.flatMap((c) => costDays(c, monthEnd).filter((d) => d.startsWith(month)).map((date) => ({ date, what: c.what, amount: c.amount_cents / 100 })));
  // Commission so far this month, one line per affiliate, on the day of its latest payment.
  const monthCommission = new Map<string, { date: string; amount: number }>();
  for (const c of owedOut.filter((c) => c.date.startsWith(month))) {
    const cur = monthCommission.get(c.code) ?? { date: c.date, amount: 0 };
    monthCommission.set(c.code, { date: c.date > cur.date ? c.date : cur.date, amount: cur.amount + c.amount });
  }
  for (const [code, v] of monthCommission) fixed.push({ date: v.date, what: `Affiliate commission (${code})`, amount: r2(v.amount) });
  const inMonth = (d: string) => d.startsWith(month) && d <= today;
  const adsSoFar = [...spend].filter(([d]) => inMonth(d)).reduce((a, [, v]) => a + v, 0);
  // The live budgets carry the month out (the user, 12 Oct 2026), not a day's actual spend, which
  // Meta runs up to 75% over and evens out across the week; yesterday's spend if Meta did not answer.
  const yesterday = days.at(-2)?.date;
  const adsPerDay = budget ?? (yesterday ? (spend.get(yesterday) ?? 0) : 0);
  const inSoFar = Object.entries(byDay).filter(([d]) => inMonth(d)).reduce((a, [, v]) => a + v.gross - v.fees, 0);
  return {
    month: { month, fixed: fixed.sort((a, b) => a.date.localeCompare(b.date)), adsSoFar: r2(adsSoFar), adsPerDay: r2(adsPerDay), daysLeft: Number(monthEnd.slice(8)) - Number(today.slice(8)), inSoFar: r2(inSoFar) },
    days,
    revenue: { gross: r2(gross), fees: r2(fees), net: r2(gross - fees) },
    invested: { ads: r2(adsTotal), other: r2(otherTotal), commission: r2(owedOut.reduce((a, c) => a + c.amount, 0)), total: r2(adsTotal + otherTotal) },
    costs,
    adsMissing,
  };
}
