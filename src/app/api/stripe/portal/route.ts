import { NextResponse } from "next/server";

import { getViewer } from "@/lib/auth";
import { siteUrl, stripe, stripeConfigured } from "@/lib/billing/stripe";

/** Sends a subscriber to Stripe's Customer Portal to manage or cancel. */
export async function POST() {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Payments are not set up yet." }, { status: 503 });
  }
  const viewer = await getViewer();
  if (!viewer.id || !viewer.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet." }, { status: 400 });
  }
  const session = await stripe().billingPortal.sessions.create({
    customer: viewer.stripeCustomerId,
    return_url: `${siteUrl()}/account`,
  });
  return NextResponse.json({ url: session.url });
}
