import { NextResponse, type NextRequest } from "next/server";

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
  if ((!plan || !plan.priceId) && (!bundle || !process.env.STRIPE_PRICE_PASS)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  // One Stripe customer per user, created on first checkout.
  let customer = viewer.stripeCustomerId;
  if (!customer) {
    const created = await stripe().customers.create({
      email: viewer.email,
      metadata: { userId: viewer.id },
    });
    customer = created.id;
    await supabaseAdmin().from("profiles").update({ stripe_customer_id: customer }).eq("id", viewer.id);
  }

  if (bundle) {
    // A pass bundle: one Price with volume tiers, quantity picks the tier.
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer,
      line_items: [{ price: process.env.STRIPE_PRICE_PASS!, quantity: bundle.qty }],
      success_url: `${siteUrl()}/account?checkout=passes`,
      cancel_url: `${siteUrl()}/pricing`,
      allow_promotion_codes: true,
      metadata: { userId: viewer.id, passes: String(bundle.qty) },
      integration_identifier: integrationId("overlay_passes"),
    });
    return NextResponse.json({ url: session.url });
  }

  // Every plan is a monthly subscription with a free trial, one trial per
  // customer, so a second subscription starts paid.
  const prior = await stripe().subscriptions.list({ customer, status: "all", limit: 1 });
  const trialled = prior.data.length > 0;

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: plan!.priceId!, quantity: 1 }],
    success_url: `${siteUrl()}/account?checkout=success`,
    cancel_url: `${siteUrl()}/pricing`,
    allow_promotion_codes: true,
    metadata: { userId: viewer.id, plan: plan!.id },
    subscription_data: {
      metadata: { userId: viewer.id, plan: plan!.id },
      ...(trialled ? {} : { trial_period_days: TRIAL_DAYS }),
    },
    integration_identifier: integrationId(`overlay_${plan!.id}`),
  });

  return NextResponse.json({ url: session.url });
}
