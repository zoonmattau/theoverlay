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

/** Stripe's own cancellation page for the subscription on the account, whatever its term. */
export async function cancelFlow(userId: string, customerId: string): Promise<string | null> {
  const { data: p } = await supabaseAdmin().from("profiles").select("stripe_subscription_id").eq("id", userId).maybeSingle();
  if (!p?.stripe_subscription_id) return null;
  const offer = await offerFor(userId);
  // A monthly trialist was shown the half-price month: saying no is remembered, so it is never made twice.
  if (!("reason" in offer)) return declineOffer(userId, customerId, offer.subscriptionId);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl()}/account`,
    flow_data: { type: "subscription_cancel", subscription_cancel: { subscription: p.stripe_subscription_id } },
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
  return switchesFor(userId, "cancel");
}

/**
 * The plans a member can move to now. From the cancel page ("cancel"): only cheaper
 * ones, a trialist at monthly prices. From the account ("change"): every other plan,
 * on the term they pay on.
 */
export async function switchesFor(userId: string, from: "cancel" | "change"): Promise<Downgrades | null> {
  const { data: p } = await supabaseAdmin().from("profiles").select("plan, stripe_subscription_id, subscription_status").eq("id", userId).maybeSingle();
  if (!p?.stripe_subscription_id || !["trialing", "active", "past_due"].includes(p.subscription_status ?? "")) return null;
  const plan = planById(p.plan ?? undefined);
  if (!plan) return null;
  const sub = await stripe().subscriptions.retrieve(p.stripe_subscription_id);
  // A trialist on the way out moves to the cheaper plan's monthly price: a big bill up front is what puts them off.
  const term = from === "cancel" && sub.status === "trialing" ? termById("month") : termById(sub.metadata?.term);
  const options = PLANS.filter((o) => o.id !== plan.id && (from === "change" || o.price < plan.price) && termPriceId(o, term)).map((o) => ({ plan: o, price: termPrice(o, term) }));
  if (options.length === 0) return null;
  return { subscriptionId: sub.id, current: plan.name, trialing: sub.status === "trialing", term, options };
}

export async function switchPlan(userId: string, planId: string, from: "cancel" | "change" = "cancel"): Promise<boolean> {
  const offer = await switchesFor(userId, from);
  const to = offer?.options.find((o) => o.plan.id === planId)?.plan;
  const price = offer && to ? termPriceId(to, offer.term) : undefined;
  if (!offer || !to || !price) return false;
  const s = stripe();
  const sub = await s.subscriptions.retrieve(offer.subscriptionId);
  const item = sub.items.data[0];
  if (!item) return false;
  await s.subscriptions.update(sub.id, {
    items: [{ id: item.id, price }],
    metadata: { ...sub.metadata, plan: to.id, term: offer.term.id },
    proration_behavior: "create_prorations",
    // Stripe takes one or the other, never both.
    ...(sub.cancel_at_period_end ? { cancel_at_period_end: false } : sub.cancel_at ? { cancel_at: "" as const } : {}),
  });
  // The webhook says the same a moment later; this is so the account page is right on the redirect.
  await supabaseAdmin().from("profiles").update({ plan: to.id }).eq("id", userId);
  await logEvent({ user_id: userId, kind: to.price > (PLANS.find((x) => x.name === offer.current)?.price ?? 0) ? "upgrade" : "downgrade", plan: to.id, amount_cents: termPrice(to, offer.term) * 100, meta: { from: offer.current, trialing: offer.trialing, term: offer.term.id } });
  return true;
}

/**
 * For a trial on a 3-month or yearly term: pay monthly instead, from today,
 * with a week on the house (payMonthlyNow). Since 26 Sep the pricing page leads with yearly, and the first
 * two to cancel a yearly trial (1 Oct, Saturday at $182) gave "too expensive"
 * and "unused": the bill in one hit, not the weekly figure, put them off.
 * Before the first paid bill only; the trial and its end date carry over.
 */
export interface MonthlySwitch {
  subscriptionId: string;
  planName: string;
  /** The term they are on now, and what it would bill. */
  term: Term;
  termPrice: number;
  /** What the plan costs a month. */
  monthly: number;
  /** When the first bill falls, yyyy-mm-dd. */
  chargeOn?: string;
  /** The term's first bill has already failed (past due): the open invoice to void once the month is paid. */
  failedInvoice?: string;
}

/**
 * The switch to monthly a member can make now, or nothing when they are
 * already monthly or have paid. A long-term trial whose first bill failed
 * (the first yearly bill, 3 Oct 2026, insufficient funds) gets it too.
 */
export async function monthlyFor(userId: string): Promise<MonthlySwitch | null> {
  const { data: p } = await supabaseAdmin().from("profiles").select("plan, stripe_subscription_id, subscription_status").eq("id", userId).maybeSingle();
  if (!p?.stripe_subscription_id || !["trialing", "active", "past_due"].includes(p.subscription_status ?? "")) return null;
  const plan = planById(p.plan ?? undefined);
  const month = termById("month");
  if (!plan || !termPriceId(plan, month)) return null;
  const sub = await stripe().subscriptions.retrieve(p.stripe_subscription_id);
  const term = termById(sub.metadata?.term);
  if (term.id === "month") return null;
  let failedInvoice: string | undefined;
  if (sub.status !== "trialing") {
    const paid = await stripe().invoices.list({ subscription: sub.id, status: "paid", limit: 3 });
    if (paid.data.some((i) => i.amount_paid > 0)) return null;
    // A first bill that has been tried and failed; the failure can arrive before the subscription reads past due.
    const open = await stripe().invoices.list({ subscription: sub.id, status: "open", limit: 3 });
    failedInvoice = open.data.find((i) => i.attempt_count > 0)?.id;
    if (sub.status === "past_due" && !failedInvoice) return null;
  }
  const chargeOn = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString().slice(0, 10) : undefined;
  return { subscriptionId: sub.id, planName: plan.name, term, termPrice: termPrice(plan, term), monthly: termPrice(plan, month), chargeOn, failedInvoice };
}

/** The extra time for paying now instead of when the trial ends: the first month runs this many days longer. */
export const PAY_NOW_DAYS = 7;

/**
 * Pay monthly from today, with a week on the house: the trial ends now, the
 * first month is charged straight away, and the next bill moves a week
 * later, the same way the win-back's five-week month does (trial_end past
 * the period's end, nothing prorated). A card that fails leaves the
 * subscription as it was, still on its trial.
 */
export async function payMonthlyNow(userId: string): Promise<"paid" | "failed" | "not-eligible"> {
  const offer = await monthlyFor(userId);
  const { data: p } = await supabaseAdmin().from("profiles").select("plan").eq("id", userId).maybeSingle();
  const plan = planById(p?.plan ?? undefined);
  const price = plan ? termPriceId(plan, termById("month")) : undefined;
  if (!offer || !plan || !price) return "not-eligible";
  const s = stripe();
  const sub = await s.subscriptions.retrieve(offer.subscriptionId);
  const item = sub.items.data[0];
  if (!item) return "not-eligible";
  try {
    await s.subscriptions.update(sub.id, {
      items: [{ id: item.id, price }],
      metadata: { ...sub.metadata, term: "month" },
      // Past due there is no trial to end: a new period from now bills the month instead.
      ...(offer.failedInvoice ? { billing_cycle_anchor: "now" as const } : { trial_end: "now" as const }),
      proration_behavior: "none",
      // Charged here and now: a declined card throws and the subscription is left untouched.
      payment_behavior: "error_if_incomplete",
      ...(sub.cancel_at_period_end ? { cancel_at_period_end: false } : sub.cancel_at ? { cancel_at: "" as const } : {}),
    });
  } catch (err) {
    console.error("[retention] pay now", userId, err);
    await logEvent({ user_id: userId, kind: "term_switch", plan: plan.id, amount_cents: null, meta: { from: offer.term.id, to: "month", paidNow: false, error: err instanceof Error ? err.message : String(err) } });
    return "failed";
  }
  // The month is paid, so the failed term bill goes, and Stripe stops retrying it.
  if (offer.failedInvoice) {
    try {
      await s.invoices.voidInvoice(offer.failedInvoice);
    } catch (err) {
      console.error("[retention] void failed bill", offer.failedInvoice, err);
    }
  }
  const paid = await s.subscriptions.retrieve(sub.id);
  const periodEnd = paid.items.data[0]?.current_period_end;
  if (periodEnd) await s.subscriptions.update(sub.id, { trial_end: periodEnd + PAY_NOW_DAYS * 86400, proration_behavior: "none" });
  await supabaseAdmin().from("profiles").update({ billing_term: "month", cancel_at: null, cancel_reason: null }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "term_switch", plan: plan.id, amount_cents: offer.monthly * 100, meta: { from: offer.term.id, to: "month", paidNow: true, extraDays: PAY_NOW_DAYS, ...(offer.failedInvoice ? { voided: offer.failedInvoice } : {}) } });
  return "paid";
}

/** The bonus for paying a failed yearly or 3-month first bill instead of dropping to monthly: a month on the house. */
export const LATE_PAY_BONUS_MONTHS = 1;

/**
 * A failed first bill on a long term that has now been paid: the next bill
 * moves a month later, the same way as the week on payMonthlyNow (trial_end
 * past the period's end, nothing prorated). Once per subscription. Called
 * from the webhook on invoice.paid.
 */
export async function rewardLatePay(userId: string, invoice: { id: string; attempt_count: number; amount_paid: number; billing_reason: string | null; parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null }): Promise<boolean> {
  if (invoice.attempt_count < 2 || invoice.amount_paid <= 0 || invoice.billing_reason !== "subscription_cycle") return false;
  const ref = invoice.parent?.subscription_details?.subscription;
  const subId = typeof ref === "string" ? ref : ref?.id;
  if (!subId) return false;
  const s = stripe();
  const sub = await s.subscriptions.retrieve(subId);
  if (termById(sub.metadata?.term).id === "month" || sub.metadata?.latePayBonus) return false;
  const paid = await s.invoices.list({ subscription: subId, status: "paid", limit: 5 });
  if (paid.data.some((i) => i.id !== invoice.id && i.amount_paid > 0)) return false;
  const periodEnd = sub.items.data[0]?.current_period_end;
  if (!periodEnd) return false;
  const end = new Date(periodEnd * 1000);
  end.setUTCMonth(end.getUTCMonth() + LATE_PAY_BONUS_MONTHS);
  await s.subscriptions.update(subId, {
    trial_end: Math.floor(end.getTime() / 1000),
    proration_behavior: "none",
    metadata: { ...sub.metadata, latePayBonus: invoice.id },
  });
  await logEvent({ user_id: userId, kind: "late_pay_bonus", plan: null, amount_cents: null, meta: { invoice: invoice.id, months: LATE_PAY_BONUS_MONTHS, nextBill: end.toISOString() } });
  return true;
}
