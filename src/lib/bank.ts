import "server-only";

import { stripe, stripeConfigured } from "@/lib/billing/stripe";

/**
 * Where the money is between a member paying and the bank: what Stripe holds
 * ready to pay out, what is still clearing and the day each lot clears, and
 * the payouts on the way and last landed. Read fresh: a payment last night
 * should not look like money in the bank (6 Oct 2026).
 */
export interface Bank {
  /** Cleared, waiting for the next payout. Dollars. */
  available: number;
  /** Paid but not cleared yet. Dollars. */
  pending: number;
  /** The pending money by the Sydney day it clears, soonest first. */
  clearing: { date: string; amount: number }[];
  /** Payouts sent and not landed yet, soonest first. */
  onTheWay: { arrives: string; amount: number }[];
  /** The last payout that landed. */
  lastPaid?: { arrived: string; amount: number };
  /** "every Monday", from Stripe's payout settings. */
  schedule?: string;
  /** Days a payment takes to clear. */
  clearDays?: number;
  /** The Sydney day the next scheduled payout goes, for a weekly schedule. */
  nextPayout?: string;
  error?: string;
}

const sydneyDay = (s: number) => new Date(s * 1000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const aud = (xs: { amount: number; currency: string }[]) => xs.filter((x) => x.currency === "aud").reduce((a, x) => a + x.amount, 0) / 100;

export async function bank(): Promise<Bank> {
  if (!stripeConfigured()) return { available: 0, pending: 0, clearing: [], onTheWay: [], error: "Stripe is not set up here." };
  try {
    const nowS = Math.floor(Date.now() / 1000);
    const [balance, payouts, account] = await Promise.all([
      stripe().balance.retrieve(),
      stripe().payouts.list({ limit: 20 }),
      stripe().accounts.retrieveCurrent().catch(() => null),
    ]);
    // Pending money clears on each movement's available_on; a month back covers anything not yet cleared.
    const clearing = new Map<string, number>();
    for await (const t of stripe().balanceTransactions.list({ created: { gte: nowS - 31 * 86400 }, limit: 100 })) {
      if (t.status !== "pending") continue;
      const d = sydneyDay(t.available_on);
      clearing.set(d, (clearing.get(d) ?? 0) + t.net / 100);
    }
    const onTheWay = payouts.data
      .filter((p) => p.status === "pending" || p.status === "in_transit")
      .map((p) => ({ arrives: sydneyDay(p.arrival_date), amount: p.amount / 100 }))
      .sort((a, b) => a.arrives.localeCompare(b.arrives));
    const last = payouts.data.find((p) => p.status === "paid");
    const s = account?.settings?.payouts?.schedule;
    const anchor = s?.weekly_anchor ? s.weekly_anchor[0].toUpperCase() + s.weekly_anchor.slice(1) : undefined;
    const every = s?.interval === "daily" ? "every day" : s?.interval === "weekly" ? `every ${anchor}` : s?.interval === "monthly" ? `monthly on the ${s.monthly_anchor}` : s?.interval === "manual" ? "only when you ask" : undefined;
    // The next anchor day after today, Sydney time.
    let nextPayout: string | undefined;
    if (s?.interval === "weekly" && anchor) {
      for (let i = 1; i <= 7 && !nextPayout; i++) {
        const t = Date.now() + i * 86400_000;
        if (new Date(t).toLocaleDateString("en-AU", { weekday: "long", timeZone: "Australia/Sydney" }) === anchor) nextPayout = sydneyDay(t / 1000);
      }
    }
    return {
      available: aud(balance.available),
      pending: aud(balance.pending),
      clearing: [...clearing].map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 })).sort((a, b) => a.date.localeCompare(b.date)),
      onTheWay,
      lastPaid: last ? { arrived: sydneyDay(last.arrival_date), amount: last.amount / 100 } : undefined,
      schedule: every,
      clearDays: s?.delay_days,
      nextPayout,
    };
  } catch (err) {
    console.error("[bank]", err);
    return { available: 0, pending: 0, clearing: [], onTheWay: [], error: err instanceof Error ? err.message : String(err) };
  }
}
