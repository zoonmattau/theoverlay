import "server-only";

import { cacheLife } from "next/cache";

import { metaSpend } from "@/lib/ads/meta-spend";
import { supabaseAdmin } from "@/lib/billing/access";
import { stripe } from "@/lib/billing/stripe";

/**
 * Money in against money out since the first day: revenue from Stripe's
 * balance (charges less refunds, less Stripe's card and Billing fees),
 * against Meta's ad spend plus the costs typed in on the Money tab (a
 * monthly line counts on its day each month until stopped). Both as running
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
  invested: { ads: number; other: number; total: number };
  costs: Cost[];
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
      (out[day] ??= { gross: 0, fees: 0 }).fees += -t.amount / 100;
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
  const [ads, byDay, { data }] = await Promise.all([
    metaSpend(SINCE, today),
    stripeByDay().catch(() => ({}) as Record<string, { gross: number; fees: number }>),
    supabaseAdmin().from("costs").select("id, date, amount_cents, what, monthly, stopped").order("date", { ascending: false }),
  ]);
  const costs = (data ?? []) as Cost[];
  const spend = new Map<string, number>();
  let adsMissing: string | undefined;
  if (ads === undefined) adsMissing = "Meta is not connected yet, so ad spend is not counted.";
  else if ("error" in ads) adsMissing = `Meta did not answer, so ad spend is not counted: ${ads.error}`;
  else for (const s of ads) spend.set(s.date, s.spend);
  const other = new Map<string, number>();
  for (const c of costs) for (const d of costDays(c, today)) other.set(d, (other.get(d) ?? 0) + c.amount_cents / 100);

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
  return {
    days,
    revenue: { gross: r2(gross), fees: r2(fees), net: r2(gross - fees) },
    invested: { ads: r2(adsTotal), other: r2(otherTotal), total: r2(adsTotal + otherTotal) },
    costs,
    adsMissing,
  };
}
