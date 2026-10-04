"use server";

import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { cancelFlow, offerFor, payMonthlyNow, switchPlan, takeOffer } from "@/lib/billing/retention";
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

/** A cheaper plan instead of cancelling, then back to the account page. */
export async function moveToPlan(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id || !stripeConfigured()) redirect("/account");
  const change = form.get("from") === "change";
  const ok = await switchPlan(viewer.id, String(form.get("plan") ?? ""), change ? "change" : "cancel");
  redirect(ok ? `/account?${change ? "tab=plan&" : ""}switched=${form.get("plan")}` : change ? "/account?tab=plan" : "/account");
}

/** Pay the first month today and get five weeks for it, then back to the account page. */
export async function payMonthlyToday(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id || !stripeConfigured()) redirect("/account");
  const result = await payMonthlyNow(viewer.id);
  const back = form.get("back") === "/account/monthly" ? "/account/monthly" : "/account/cancel";
  redirect(result === "paid" ? "/account?switched=paid-now" : result === "failed" ? `${back}?card=declined` : "/account");
}

/** No thanks: straight into Stripe's cancellation for the subscription, on any term. */
export async function cancelAnyway(): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id || !viewer.stripeCustomerId || !stripeConfigured()) redirect("/account");
  const url = await cancelFlow(viewer.id, viewer.stripeCustomerId);
  redirect(url ?? "/account");
}
