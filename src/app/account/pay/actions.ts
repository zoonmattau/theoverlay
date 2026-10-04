"use server";

import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { stripeConfigured } from "@/lib/billing/stripe";
import { newCardUrl, payOwed } from "@/lib/billing/unpaid";

/** Pays the failed bill now on the card shown, then back to the account page. */
export async function payNow(): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id || !stripeConfigured()) redirect("/account");
  const result = await payOwed(viewer.id);
  redirect(result === "paid" ? "/account?paid=1" : result === "declined" ? "/account/pay?card=declined" : "/account");
}

/** Off to Stripe to add a card; it comes back here to pay with it. */
export async function useNewCard(): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id || !viewer.stripeCustomerId || !stripeConfigured()) redirect("/account");
  redirect(await newCardUrl(viewer.stripeCustomerId));
}
