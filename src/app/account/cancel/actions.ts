"use server";

import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { declineOffer, offerFor, takeOffer } from "@/lib/billing/retention";
import { stripeConfigured } from "@/lib/billing/stripe";

/** Half price on the first month, then back to the account page. */
export async function keepAtHalfPrice(): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id || !stripeConfigured()) redirect("/account");
  const offer = await offerFor(viewer.id);
  if ("reason" in offer) redirect("/account");
  await takeOffer(viewer.id, offer);
  redirect("/account?offer=taken");
}

/** No thanks: straight into Stripe's cancellation for the subscription. */
export async function cancelAnyway(): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id || !viewer.stripeCustomerId || !stripeConfigured()) redirect("/account");
  const offer = await offerFor(viewer.id);
  const subscriptionId = "reason" in offer ? undefined : offer.subscriptionId;
  if (!subscriptionId) redirect("/account");
  redirect(await declineOffer(viewer.id, viewer.stripeCustomerId, subscriptionId));
}
