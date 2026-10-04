import "server-only";

import { supabaseAdmin } from "./access";
import type { Plan } from "./plans";
import { stripe } from "./stripe";

/**
 * 25% off the first month for someone who opened a checkout and did not
 * finish, good until midnight Sydney on the day the email goes. Written on the
 * account by the email (lib/email/checkout-nudge.ts), applied by checkout,
 * spent by the webhook once the subscription starts. A quarter of the plan's
 * monthly price off the first bill, whatever the term, so a yearly sign-up
 * gets a month's worth and not a quarter of the year.
 */
export const FIRST_MONTH_OFF = 0.25;

/** The offer's end, written on the account. */
export async function offerFirstMonth(userId: string, until: Date): Promise<void> {
  const db = supabaseAdmin();
  const { data } = await db.auth.admin.getUserById(userId);
  if (!data.user) return;
  await db.auth.admin.updateUserById(userId, { app_metadata: { ...data.user.app_metadata, first_month_off_until: until.toISOString() } });
}

/** When this member's offer ends, if it is still running. */
export async function firstMonthOfferUntil(userId: string): Promise<Date | undefined> {
  const { data } = await supabaseAdmin().auth.admin.getUserById(userId);
  const until = data.user?.app_metadata?.first_month_off_until;
  return until && new Date(until).getTime() > Date.now() ? new Date(until) : undefined;
}

/** Used once a subscription starts with it. */
export async function spendFirstMonth(userId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data } = await db.auth.admin.getUserById(userId);
  if (!data.user?.app_metadata?.first_month_off_until) return;
  await db.auth.admin.updateUserById(userId, { app_metadata: { ...data.user.app_metadata, first_month_off_until: null } });
}

/**
 * The coupon for a plan: a quarter of its monthly price off, on bills in the
 * first month after checkout. That is the first bill whether it falls at the
 * end of a trial or straight away, and never the renewal after it.
 */
export async function firstMonthCoupon(plan: Plan): Promise<string> {
  const cents = Math.round(plan.price * 100 * FIRST_MONTH_OFF);
  const id = `FIRST_MONTH_25_${cents}`;
  const s = stripe();
  try {
    await s.coupons.retrieve(id);
  } catch {
    await s.coupons.create({ id, amount_off: cents, currency: "aud", duration: "repeating", duration_in_months: 1, name: "25% off your first month" });
  }
  return id;
}
