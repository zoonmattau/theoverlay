import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { logEvent, recordPayment } from "@/lib/admin";
import { creditPasses, emailForUser, grantAccess, supabaseAdmin, userIdForCustomer } from "@/lib/billing/access";
import { billingTerm, planById } from "@/lib/billing/plans";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";
import { syncDiscordMember } from "@/lib/discord";
import { EMAILS } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";
import { longDate } from "@/lib/format";
import { rewardReferral } from "@/lib/referrals";
import { failedPaymentEmail, graceUntil } from "@/lib/billing/grace";
import { spendComeback } from "@/lib/billing/comeback";
import { rewardLatePay } from "@/lib/billing/retention";
import { spendFirstMonth } from "@/lib/billing/first-month";

/**
 * Stripe is the source of truth for who has paid. Every event that changes
 * access lands here and writes one timestamp: access_until.
 *
 * Register the endpoint for: checkout.session.completed,
 * checkout.session.async_payment_succeeded, customer.subscription.created,
 * customer.subscription.updated, customer.subscription.deleted, invoice.paid,
 * invoice.payment_failed.
 */
const TERM_WORDS: Record<string, string> = { week: "a week", month: "a month", quarter: "every 3 months", year: "a year" };

/**
 * The first charge after a trial as the welcome email states it, "$470 a year":
 * Stripe's preview of the bill, so a discount shows, else the price itself.
 * A cardholder's bank asks whether the amount and term were spelled out before
 * the first charge (a yearly trial billed $470, 3 Oct 2026). Undefined when unknown.
 */
async function firstBill(sub: Stripe.Subscription): Promise<string | undefined> {
  const price = sub.items.data[0]?.price;
  const term = TERM_WORDS[billingTerm(price?.recurring) ?? ""];
  if (!term) return undefined;
  const preview = await stripe().invoices.createPreview({ subscription: sub.id }).catch(() => null);
  const cents = preview?.amount_due ?? price?.unit_amount ?? undefined;
  if (!cents) return undefined;
  const dollars = cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100);
  return `$${Number(dollars).toLocaleString("en-AU", { minimumFractionDigits: cents % 100 ? 2 : 0 })} ${term}`;
}

export async function POST(request: NextRequest) {
  if (!stripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // Pass bundles are credited here. Subscriptions are settled by the
      // subscription events below, which carry the period end.
      const session = event.data.object;
      const passes = Number(session.metadata?.passes ?? 0);
      const userId = session.metadata?.userId;
      if (passes > 0 && userId && session.payment_status === "paid") {
        const total = await creditPasses({ sessionId: session.id, userId, quantity: passes });
        if (total !== undefined) {
          await recordPayment(userId, session.amount_total ?? 0, `passes_${passes}`, { session: session.id });
          await logEvent({ user_id: userId, kind: "checkout_completed", plan: `passes_${passes}`, amount_cents: session.amount_total ?? null, meta: null });
        }
        const to = await emailForUser(userId);
        if (to && total !== undefined) await sendEmail(to, EMAILS.passesAdded(passes, total));
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const userId = sub.metadata?.userId ?? (await userIdForCustomer(customerId));
      if (!userId) break;
      // A subscription that ends while the customer has another live one says nothing about their
      // access: a cancelled Saturday trial's deletion wrote "cancelled" over a paid Every day plan (4 Oct 2026).
      if (!["active", "trialing", "past_due"].includes(sub.status)) {
        const others = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 10 });
        if (others.data.some((o) => o.id !== sub.id && ["active", "trialing", "past_due"].includes(o.status))) {
          await logEvent({ user_id: userId, kind: "subscription_superseded", plan: sub.metadata?.plan ?? null, amount_cents: null, meta: { subscription: sub.id, status: sub.status, event: event.type } });
          break;
        }
      }
      // A member whose bill failed and who then cancels is done now: no grace week, no retries on
      // a year they turned down. The deletion this fires ends access (a yearly trialist, 5 Oct 2026).
      if (sub.status === "past_due" && (sub.cancel_at || sub.cancel_at_period_end)) {
        await stripe().subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
        const open = await stripe().invoices.list({ subscription: sub.id, status: "open", limit: 10 });
        for (const inv of open.data) if (inv.id) await stripe().invoices.voidInvoice(inv.id);
        await logEvent({ user_id: userId, kind: "past_due_cancelled", plan: sub.metadata?.plan ?? null, amount_cents: null, meta: { subscription: sub.id, voided: open.data.map((i) => i.id) } });
        break;
      }
      const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
      const periodEnd = sub.items.data[0]?.current_period_end;
      const planId = sub.metadata?.plan ?? "subscription";
      // A payment that failed leaves a week's grace, not the rest of the period Stripe opened.
      let period = active && periodEnd ? new Date(periodEnd * 1000) : new Date(0);
      // The win-back offer: the first bill is paid, so the next one moves out a
      // week. A trial end on the paid subscription, with no proration, is the
      // free week; the update's own event then carries the later date.
      const extra = Number(sub.metadata?.comeback_days ?? 0);
      if (event.type === "customer.subscription.created" && sub.status === "active" && extra > 0 && periodEnd && !sub.metadata?.comeback_applied) {
        const trialEnd = periodEnd + extra * 86400;
        await stripe().subscriptions.update(sub.id, { trial_end: trialEnd, proration_behavior: "none", metadata: { ...sub.metadata, comeback_applied: new Date().toISOString() } });
        await spendComeback(userId);
        await logEvent({ user_id: userId, kind: "comeback", plan: sub.metadata?.plan ?? null, amount_cents: null, meta: { days: extra, nextBill: new Date(trialEnd * 1000).toISOString() } });
        period = new Date(trialEnd * 1000);
      }
      const until = sub.status === "past_due" ? new Date(Math.min(period.getTime(), (await graceUntil(userId)).getTime())) : period;
      await grantAccess({
        userId,
        plan: planId,
        // A cancelled or unpaid subscription ends access now; an active one
        // runs to the end of the paid period, even if set to cancel then.
        until,
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.status === "canceled" ? null : sub.id,
      });
      // A cancellation booked for the end of the period sits in cancel_at
      // (a trial's, always) or behind cancel_at_period_end; either is a
      // member on the way out, and the admin should say so.
      const cancelAt = cancelDate(sub, until);
      const cancelReason = cancelAt ? sub.cancellation_details?.feedback ?? sub.cancellation_details?.reason ?? null : null;
      await supabaseAdmin()
        .from("profiles")
        .update({
          subscription_status: sub.status,
          billing_term: sub.status === "canceled" ? null : billingTerm(sub.items.data[0]?.price.recurring),
          cancel_at: cancelAt?.toISOString() ?? null,
          cancel_reason: cancelReason,
          ...(event.type === "customer.subscription.created" ? { subscribed_since: new Date(sub.created * 1000).toISOString() } : {}),
        })
        .eq("id", userId);
      // The Member role in Discord follows access.
      await syncDiscordMember(userId);
      await logEvent({
        user_id: userId,
        kind: "subscription",
        plan: planId,
        amount_cents: null,
        meta: { status: sub.status, term: billingTerm(sub.items.data[0]?.price.recurring), event: event.type, cancelAtPeriodEnd: sub.cancel_at_period_end, cancelAt: cancelAt?.toISOString() ?? null, cancelReason, until: until.toISOString() },
      });

      // One email per state change, never one per Stripe retry.
      const planName = planById(planId)?.name ?? "Overlay";
      const to = await emailForUser(userId);
      if (to) {
        const when = longDate(until.toISOString().slice(0, 10));
        if (event.type === "customer.subscription.created") {
          await sendEmail(to, sub.status === "trialing" ? EMAILS.trialStarted(planName, when, await firstBill(sub)) : EMAILS.planActive(planName, when));
          // An invited friend starting a plan earns both sides their fortnight.
          await rewardReferral(userId);
          if (sub.metadata?.first_month_off) await spendFirstMonth(userId);
        } else if (event.type === "customer.subscription.updated" && cancelAt && !previousCancel(event)) {
          await sendEmail(to, EMAILS.planCancelled(planName, longDate(cancelAt.toISOString().slice(0, 10))));
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      const userId = customerId ? await userIdForCustomer(customerId) : undefined;
      const to = userId ? await emailForUser(userId) : undefined;
      // Stripe's first failed attempt only: each retry fires this event again, and the
      // reminders on days three and six do the rest (one member had five of these, Sep 2026).
      if (to && userId && invoice.attempt_count === 1) {
        const ok = await sendEmail(to, await failedPaymentEmail(userId, 1));
        if (ok) await supabaseAdmin().from("events").insert({ user_id: userId, kind: "payment_reminder", plan: null, amount_cents: null, meta: { n: 1 } });
      }
      break;
    }

    case "invoice.paid": {
      // The subscription events carry the state change; this one carries the money.
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      const userId = customerId ? await userIdForCustomer(customerId) : undefined;
      if (userId && invoice.amount_paid > 0) {
        const { data } = await supabaseAdmin().from("profiles").select("plan").eq("id", userId).maybeSingle();
        await recordPayment(userId, invoice.amount_paid, data?.plan ?? null, { invoice: invoice.id });
        // A failed yearly or 3-month first bill paid after all: a month on the house, as the payment emails promise.
        try { await rewardLatePay(userId, invoice); } catch (err) { console.error("[webhook] late pay bonus", err); }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

/** When the subscription is booked to end, if it is: cancel_at, or the period's end when cancel_at_period_end is set. */
function cancelDate(sub: Stripe.Subscription, until: Date): Date | undefined {
  if (sub.status === "canceled") return undefined;
  if (sub.cancel_at) return new Date(sub.cancel_at * 1000);
  return sub.cancel_at_period_end ? until : undefined;
}

/** Whether a cancellation was already booked before this update, in either field. */
function previousCancel(event: Stripe.Event): boolean {
  const prev = (event.data as { previous_attributes?: { cancel_at_period_end?: boolean; cancel_at?: number | null } }).previous_attributes;
  if (!prev) return true;
  if (prev.cancel_at !== undefined) return prev.cancel_at !== null;
  if (prev.cancel_at_period_end !== undefined) return prev.cancel_at_period_end;
  return true;
}
