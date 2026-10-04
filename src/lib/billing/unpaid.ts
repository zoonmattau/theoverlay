import "server-only";

import type Stripe from "stripe";

import { logEvent } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { planById, termById } from "@/lib/billing/plans";
import { siteUrl, stripe } from "@/lib/billing/stripe";

/**
 * Paying a failed bill now, from /account/pay. Updating the card in Stripe's
 * portal charges nothing until the next scheduled retry, and the retry uses the
 * subscription's own card first (every subscription has one, from checkout), so
 * a new card could sit unused while the board stays closed. Here the member
 * pays the open bill on the spot, on the card they have or a new one, and the
 * card that pays becomes the subscription's.
 */
export interface Owed {
  subscriptionId: string;
  invoiceId: string;
  /** Dollars. */
  amount: number;
  planName: string;
  /** A failed yearly or 3-month first bill: paying it adds the month on us (rewardLatePay). */
  longTerm: boolean;
  months: number;
  /** What a payment now would use, as the page says it: "Mastercard ending 6875", "Link". */
  method?: string;
}

/** The bill this member owes now, if their payment failed and the bill is still open. */
export async function owedFor(userId: string): Promise<Owed | null> {
  const { data: p } = await supabaseAdmin().from("profiles").select("plan, stripe_customer_id, stripe_subscription_id").eq("id", userId).maybeSingle();
  if (!p?.stripe_subscription_id || !p.stripe_customer_id) return null;
  const s = stripe();
  const [sub, open] = await Promise.all([
    s.subscriptions.retrieve(p.stripe_subscription_id),
    s.invoices.list({ subscription: p.stripe_subscription_id, status: "open", limit: 3 }),
  ]);
  const invoice = open.data.find((i) => i.attempt_count > 0);
  if (!invoice?.id) return null;
  const term = termById(sub.metadata?.term);
  const pm = await payingMethod(p.stripe_customer_id, sub);
  const paidBefore = (await s.invoices.list({ subscription: sub.id, status: "paid", limit: 3 })).data.some((i) => i.amount_paid > 0);
  return {
    subscriptionId: sub.id,
    invoiceId: invoice.id,
    amount: invoice.amount_due / 100,
    planName: planById(p.plan ?? undefined)?.name ?? "Overlay",
    longTerm: term.id !== "month" && !paidBefore,
    months: term.months,
    method: pm ? methodLabel(pm) : undefined,
  };
}

const methodLabel = (pm: Stripe.PaymentMethod) =>
  pm.card ? `${pm.card.brand[0].toUpperCase()}${pm.card.brand.slice(1)} ending ${pm.card.last4}` : pm.type === "link" ? "Link" : pm.type.replace(/_/g, " ");

/** The customer's default card if they have set one (the portal does), else the subscription's. */
async function payingMethod(customerId: string, sub: Stripe.Subscription): Promise<Stripe.PaymentMethod | undefined> {
  const s = stripe();
  const customer = await s.customers.retrieve(customerId);
  const fromCustomer = !customer.deleted ? customer.invoice_settings?.default_payment_method : undefined;
  const id = (typeof fromCustomer === "string" ? fromCustomer : fromCustomer?.id) ?? (typeof sub.default_payment_method === "string" ? sub.default_payment_method : sub.default_payment_method?.id);
  return id ? await s.paymentMethods.retrieve(id) : undefined;
}

/** Charges the open bill now. The card that pays becomes the subscription's, so the next bill uses it too. */
export async function payOwed(userId: string): Promise<"paid" | "declined" | "none"> {
  const owed = await owedFor(userId);
  const { data: p } = await supabaseAdmin().from("profiles").select("stripe_customer_id").eq("id", userId).maybeSingle();
  if (!owed || !p?.stripe_customer_id) return "none";
  const s = stripe();
  const sub = await s.subscriptions.retrieve(owed.subscriptionId);
  const pm = await payingMethod(p.stripe_customer_id, sub);
  if (!pm) return "declined";
  try {
    if ((typeof sub.default_payment_method === "string" ? sub.default_payment_method : sub.default_payment_method?.id) !== pm.id) {
      await s.subscriptions.update(sub.id, { default_payment_method: pm.id });
    }
    await s.invoices.pay(owed.invoiceId, { payment_method: pm.id, off_session: true });
  } catch (err) {
    await logEvent({ user_id: userId, kind: "pay_owed", plan: null, amount_cents: Math.round(owed.amount * 100), meta: { invoice: owed.invoiceId, paid: false, error: err instanceof Error ? err.message : String(err) } });
    return "declined";
  }
  // The webhook's invoice.paid and subscription events reopen the board and add the month.
  await logEvent({ user_id: userId, kind: "pay_owed", plan: null, amount_cents: Math.round(owed.amount * 100), meta: { invoice: owed.invoiceId, paid: true } });
  return "paid";
}

/** Stripe's portal straight to adding a card, back to /account/pay to pay with it. */
export async function newCardUrl(customerId: string): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl()}/account/pay`,
    flow_data: { type: "payment_method_update", after_completion: { type: "redirect", redirect: { return_url: `${siteUrl()}/account/pay?card=new` } } },
  });
  return session.url;
}
