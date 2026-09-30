import "server-only";

import { supabaseAdmin } from "./access";

/**
 * The win-back offer: come back on any plan, pay the first bill as normal,
 * and the next one is pushed out this many days, so a month buys five weeks.
 * Written on the account by the win-back email, carried on the subscription
 * by checkout, and applied by the webhook once the first bill is paid.
 */
export const COMEBACK_DAYS = 7;

/** Marks a member as offered the extra week. */
export async function offerComeback(userId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data } = await db.auth.admin.getUserById(userId);
  if (!data.user) return;
  await db.auth.admin.updateUserById(userId, { app_metadata: { ...data.user.app_metadata, comeback_days: COMEBACK_DAYS } });
}

/** The extra days this member has been offered and not yet used, else 0. */
export async function comebackDays(userId: string): Promise<number> {
  const { data } = await supabaseAdmin().auth.admin.getUserById(userId);
  const n = Number(data.user?.app_metadata?.comeback_days);
  return n > 0 ? n : 0;
}

/** Once the extra week is on the subscription, the offer is used up. */
export async function spendComeback(userId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data } = await db.auth.admin.getUserById(userId);
  if (!data.user) return;
  await db.auth.admin.updateUserById(userId, { app_metadata: { ...data.user.app_metadata, comeback_days: null } });
}
