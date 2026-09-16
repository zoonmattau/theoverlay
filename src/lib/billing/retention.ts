import "server-only";

import { logEvent } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { planById } from "@/lib/billing/plans";
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
