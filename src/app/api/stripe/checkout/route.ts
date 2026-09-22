import { NextResponse, type NextRequest } from "next/server";

import { logEvent } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { passBundle, planById, TRIAL_DAYS } from "@/lib/billing/plans";
import { integrationId, siteUrl, stripe, stripeConfigured } from "@/lib/billing/stripe";
import { supabaseAdmin } from "@/lib/billing/access";

/**
 * POST { plan } or { passes } from a signed-in user: sends them to Stripe
 * Checkout, a subscription for a plan or a one-off payment for a pass bundle.
 */
export async function POST(request: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Payments are not set up yet." }, { status: 503 });
  }
  const viewer = await getViewer();
  if (!viewer.id) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { plan?: string; passes?: number };
  const plan = body.plan ? planById(body.plan) : undefined;
  const bundle = body.passes ? passBundle(Number(body.passes)) : undefined;
  if ((!plan || !plan.priceId) && (!bundle || !bundle.priceId)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }
  const chosen = plan ? plan.id : `passes_${bundle!.qty}`;
  // An admin poking at checkout is not a lead; keep the funnel to members and visitors.
  const log = (e: Parameters<typeof logEvent>[0]) => (viewer.admin ? Promise.resolve() : logEvent(e));
  await log({ user_id: viewer.id, kind: "plan_click", plan: chosen, amount_cents: null, meta: null });

  // One Stripe customer per user, created on first checkout.
  let customer = viewer.stripeCustomerId;
  const newCustomer = !customer;
  if (!customer) {
    const created = await stripe().customers.create({
      email: viewer.email,
      metadata: { userId: viewer.id },
    });
    customer = created.id;
    await supabaseAdmin().from("profiles").update({ stripe_customer_id: customer }).eq("id", viewer.id);
  }

  if (bundle) {
    // A pass bundle: one one-off Price per bundle size.
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer,
      line_items: [{ price: bundle.priceId!, quantity: 1 }],
      success_url: `${siteUrl()}/account?checkout=passes&amount=${bundle.price}`,
      cancel_url: `${siteUrl()}/pricing`,
      allow_promotion_codes: true,
      metadata: { userId: viewer.id, passes: String(bundle.qty) },
      integration_identifier: integrationId("overlay_passes"),
    });
    await log({ user_id: viewer.id, kind: "checkout_started", plan: chosen, amount_cents: bundle.price * 100, meta: { session: session.id } });
    return NextResponse.json({ url: session.url });
  }

  // Every plan is a monthly subscription with a free trial, one trial per
  // customer, so a second subscription starts paid. A customer made just now
  // cannot have one, which saves a round trip on the common path.
  const trialled = newCustomer
    ? false
    : (await stripe().subscriptions.list({ customer, status: "all", limit: 1 })).data.length > 0;
  // A longer trial offered to this person (scripts/out/nudge-signups.ts writes it) beats the standard one.
  const offered = Number((await supabaseAdmin().auth.admin.getUserById(viewer.id)).data.user?.app_metadata?.trial_days);
  const trialDays = offered > TRIAL_DAYS ? offered : TRIAL_DAYS;
  // The trial ends at midnight Sydney time as the seventh day begins, not
  // seven days to the minute: buy on a Tuesday afternoon and the first
  // charge comes as the clock ticks over to next Tuesday.
  const trialEnd = trialEndAt(trialDays);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: plan!.priceId!, quantity: 1 }],
    success_url: `${siteUrl()}/account?checkout=success&plan=${plan!.id}&amount=${plan!.price}&trial=${trialled ? 0 : 1}`,
    cancel_url: `${siteUrl()}/pricing`,
    allow_promotion_codes: true,
    metadata: { userId: viewer.id, plan: plan!.id },
    subscription_data: {
      metadata: { userId: viewer.id, plan: plan!.id },
      ...(trialled ? {} : { trial_end: trialEnd }),
    },
    integration_identifier: integrationId(`overlay_${plan!.id}`),
  });
  await log({ user_id: viewer.id, kind: "checkout_started", plan: chosen, amount_cents: null, meta: { session: session.id, trial: !trialled } });

  return NextResponse.json({ url: session.url });
}

/** Midnight in Sydney at the start of the day `days` from today, as a Unix timestamp. */
function trialEndAt(days: number): number {
  const local = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const [y, m, d] = local.split("-").map(Number);
  // Noon UTC on the target date is the same calendar day in Sydney; from there find that day's midnight there.
  const target = new Date(Date.UTC(y, m - 1, d + days, 12));
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(target);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? 0), mm = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return Math.floor((target.getTime() - (hh * 60 + mm) * 60_000) / 1000);
}
