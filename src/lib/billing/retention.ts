import "server-only";

import { logEvent } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { PLANS, planById, termById, termPrice, termPriceId, type Plan, type Term } from "@/lib/billing/plans";
import { siteUrl, stripe } from "@/lib/billing/stripe";

/**
 * The offer on the way out: half price on the first paid month, once per
 * customer, put to anyone who goes to cancel before their trial or first
 * month has been charged. Taken, it is a 50% coupon applied once to the
 * subscription's next invoice. Declined, they go straight into Stripe's
 * cancellation.
 */

const COUPON_ID = "HALF_FIRST_MONTH";
const OFFER_KIND = "retention_offer";

export interface Offer {
  subscriptionId: string;
  planName: string;
  /** Full and offered price for the first month, dollars. */
  full: number;
  offered: number;
  /** When the first charge falls, yyyy-mm-dd, so the page can say so. */
  chargeOn?: string;
}

/** The offer a member can be made now, or why not. */
export async function offerFor(userId: string): Promise<Offer | { reason: "no-subscription" | "already-offered" | "not-eligible" }> {
  const db = supabaseAdmin();
  const [{ data: p }, { data: prior }] = await Promise.all([
    db.from("profiles").select("plan, stripe_subscription_id, subscription_status").eq("id", userId).maybeSingle(),
    db.from("events").select("id").eq("user_id", userId).eq("kind", OFFER_KIND).limit(1),
  ]);
  if (!p?.stripe_subscription_id) return { reason: "no-subscription" };
  if (prior && prior.length > 0) return { reason: "already-offered" };
  const sub = await stripe().subscriptions.retrieve(p.stripe_subscription_id);
  // Only before the first paid month has been billed: a trial, or an active plan with nothing paid yet.
  const paidInvoices = await stripe().invoices.list({ subscription: sub.id, status: "paid", limit: 3 });
  const nothingPaid = paidInvoices.data.every((i) => i.amount_paid === 0);
  if (!(sub.status === "trialing" || (sub.status === "active" && nothingPaid))) return { reason: "not-eligible" };
  // Half off the first bill is half a month on monthly; on a longer term it would be months free, so it is monthly only.
  if (termById(sub.metadata?.term).id !== "month") return { reason: "not-eligible" };
  const plan = planById(p.plan ?? undefined);
  const full = plan?.price ?? Math.round((sub.items.data[0]?.price.unit_amount ?? 0) / 100);
  const periodEnd = sub.items.data[0]?.current_period_end;
  const chargeOn = sub.trial_end ? new Date(sub.trial_end * 1000) : periodEnd ? new Date(periodEnd * 1000) : undefined;
  return { subscriptionId: sub.id, planName: plan?.name ?? "your plan", full, offered: Math.round((full / 2) * 100) / 100, chargeOn: chargeOn?.toISOString().slice(0, 10) };
}

/** Applies the half-price month and remembers the offer was made, so it is never made twice. */
export async function takeOffer(userId: string, offer: Offer): Promise<void> {
  const s = stripe();
  try {
    await s.coupons.retrieve(COUPON_ID);
  } catch {
    await s.coupons.create({ id: COUPON_ID, percent_off: 50, duration: "once", name: "First month half price" });
  }
  await s.subscriptions.update(offer.subscriptionId, { discounts: [{ coupon: COUPON_ID }] });
  await logEvent({ user_id: userId, kind: OFFER_KIND, plan: null, amount_cents: null, meta: { taken: true, full: offer.full, offered: offer.offered } });
}

/** Remembers the offer was declined and hands back the portal's cancellation page for the subscription. */
export async function declineOffer(userId: string, customerId: string, subscriptionId: string): Promise<string> {
  await logEvent({ user_id: userId, kind: OFFER_KIND, plan: null, amount_cents: null, meta: { taken: false } });
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl()}/account`,
    flow_data: { type: "subscription_cancel", subscription_cancel: { subscription: subscriptionId } },
  });
  return session.url;
}

/**
 * The other way to stay: a cheaper plan. Every sign-up so far has taken Every
 * day on the free trial, and the price is what loses them when it ends, so the
 * way out offers the plans under theirs. The switch keeps the trial, credits
 * any unused part of a paid month and lifts a booked cancellation.
 */
export interface Downgrades {
  subscriptionId: string;
  current: string;
  trialing: boolean;
  /** They keep the term they pay on: a yearly member moves to the cheaper plan's yearly price. */
  term: Term;
  options: { plan: Plan; price: number }[];
}

/** The cheaper plans a member can move to now, or nothing when there are none. */
export async function downgradesFor(userId: string): Promise<Downgrades | null> {
  const { data: p } = await supabaseAdmin().from("profiles").select("plan, stripe_subscription_id, subscription_status").eq("id", userId).maybeSingle();
  if (!p?.stripe_subscription_id || !["trialing", "active", "past_due"].includes(p.subscription_status ?? "")) return null;
  const plan = planById(p.plan ?? undefined);
  if (!plan) return null;
  const sub = await stripe().subscriptions.retrieve(p.stripe_subscription_id);
  const term = termById(sub.metadata?.term);
  const options = PLANS.filter((o) => o.price < plan.price && termPriceId(o, term)).map((o) => ({ plan: o, price: termPrice(o, term) }));
  if (options.length === 0) return null;
  return { subscriptionId: sub.id, current: plan.name, trialing: sub.status === "trialing", term, options };
}

/** Moves the subscription to a cheaper plan. The webhook carries the new plan onto the profile. */
export async function switchPlan(userId: string, planId: string): Promise<boolean> {
  const offer = await downgradesFor(userId);
  const to = offer?.options.find((o) => o.plan.id === planId)?.plan;
  const price = offer && to ? termPriceId(to, offer.term) : undefined;
  if (!offer || !to || !price) return false;
  const s = stripe();
  const sub = await s.subscriptions.retrieve(offer.subscriptionId);
  const item = sub.items.data[0];
  if (!item) return false;
  await s.subscriptions.update(sub.id, {
    items: [{ id: item.id, price }],
    metadata: { ...sub.metadata, plan: to.id },
    proration_behavior: "create_prorations",
    // Stripe takes one or the other, never both.
    ...(sub.cancel_at_period_end ? { cancel_at_period_end: false } : sub.cancel_at ? { cancel_at: "" as const } : {}),
  });
  // The webhook says the same a moment later; this is so the account page is right on the redirect.
  await supabaseAdmin().from("profiles").update({ plan: to.id }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "downgrade", plan: to.id, amount_cents: termPrice(to, offer.term) * 100, meta: { from: offer.current, trialing: offer.trialing, term: offer.term.id } });
  return true;
}
