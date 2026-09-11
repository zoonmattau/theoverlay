import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { logEvent, recordPayment } from "@/lib/admin";
import { creditPasses, emailForUser, grantAccess, supabaseAdmin, userIdForCustomer } from "@/lib/billing/access";
import { planById } from "@/lib/billing/plans";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";
import { EMAILS } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";
import { longDate } from "@/lib/format";
import { rewardReferral } from "@/lib/referrals";

/**
 * Stripe is the source of truth for who has paid. Every event that changes
 * access lands here and writes one timestamp: access_until.
 *
 * Register the endpoint for: checkout.session.completed,
 * checkout.session.async_payment_succeeded, customer.subscription.created,
 * customer.subscription.updated, customer.subscription.deleted, invoice.paid,
 * invoice.payment_failed.
 */
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
      const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
      const periodEnd = sub.items.data[0]?.current_period_end;
      const planId = sub.metadata?.plan ?? "subscription";
      const until = active && periodEnd ? new Date(periodEnd * 1000) : new Date(0);
      await grantAccess({
        userId,
        plan: planId,
        // A cancelled or unpaid subscription ends access now; an active one
        // runs to the end of the paid period, even if set to cancel then.
        until,
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.status === "canceled" ? null : sub.id,
      });
      await supabaseAdmin()
        .from("profiles")
        .update({
          subscription_status: sub.status,
          ...(event.type === "customer.subscription.created" ? { subscribed_since: new Date(sub.created * 1000).toISOString() } : {}),
        })
        .eq("id", userId);
      await logEvent({
        user_id: userId,
        kind: "subscription",
        plan: planId,
        amount_cents: null,
        meta: { status: sub.status, event: event.type, cancelAtPeriodEnd: sub.cancel_at_period_end, until: until.toISOString() },
      });

      // One email per state change, never one per Stripe retry.
      const planName = planById(planId)?.name ?? "Overlay";
      const to = await emailForUser(userId);
      if (to) {
        const when = longDate(until.toISOString().slice(0, 10));
        if (event.type === "customer.subscription.created") {
          await sendEmail(to, sub.status === "trialing" ? EMAILS.trialStarted(planName, when) : EMAILS.planActive(planName, when));
          // An invited friend starting a plan earns both sides their fortnight.
          await rewardReferral(userId);
        } else if (event.type === "customer.subscription.updated" && sub.cancel_at_period_end && !previousCancel(event)) {
          await sendEmail(to, EMAILS.planCancelled(planName, when));
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      const userId = customerId ? await userIdForCustomer(customerId) : undefined;
      const to = userId ? await emailForUser(userId) : undefined;
      if (to) await sendEmail(to, EMAILS.paymentFailed("Overlay"));
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
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

/** Whether cancel_at_period_end was already set before this update. */
function previousCancel(event: Stripe.Event): boolean {
  const prev = (event.data as { previous_attributes?: { cancel_at_period_end?: boolean } }).previous_attributes;
  return prev?.cancel_at_period_end === undefined ? true : prev.cancel_at_period_end;
}
