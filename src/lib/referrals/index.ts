import "server-only";
import { randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/billing/access";
import { EMAILS } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";

export const REF_COOKIE = "overlay_ref";
export const BONUS_DAYS = 14;

/** A member's invite code, made on first use. Unambiguous letters only. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("profiles").select("referral_code").eq("id", userId).maybeSingle();
  if (data?.referral_code) return data.referral_code;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
    const { error } = await admin.from("profiles").update({ referral_code: code }).eq("id", userId);
    if (!error) return code;
  }
  throw new Error("could not make an invite code");
}

/** Who owns a code, for the landing page. */
export async function referrerForCode(code: string): Promise<{ id: string; email?: string } | undefined> {
  const { data } = await supabaseAdmin().from("profiles").select("id, email").eq("referral_code", code).maybeSingle();
  return data ? { id: data.id, email: data.email ?? undefined } : undefined;
}

/**
 * Records who invited a new member. Nothing is paid yet: the fortnight for
 * both sides lands when the friend starts a plan, see rewardReferral().
 */
export async function applyReferral(referredId: string, code: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("apply_referral", { p_referred: referredId, p_code: code });
  return !error && Boolean(data);
}

/**
 * The friend has started a plan: both sides get their fortnight, once, and
 * hear about it. Called from the Stripe webhook.
 */
export async function rewardReferral(referredId: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data: referrerId, error } = await admin.rpc("reward_referral", { p_referred: referredId });
  if (error || !referrerId) return false;
  const [{ data: referrer }, { data: referred }] = await Promise.all([
    admin.from("profiles").select("email, bonus_until").eq("id", referrerId as string).maybeSingle(),
    admin.from("profiles").select("email, bonus_until").eq("id", referredId).maybeSingle(),
  ]);
  if (referrer?.email) await sendEmail(referrer.email, EMAILS.friendJoined(referrer.bonus_until ?? ""));
  if (referred?.email) await sendEmail(referred.email, EMAILS.giftReceived(referred.bonus_until ?? ""));
  return true;
}

/** Invite stats for the account and invite pages. */
export async function referralCount(userId: string): Promise<number> {
  const { count } = await supabaseAdmin().from("referrals").select("*", { count: "exact", head: true }).eq("referrer_id", userId);
  return count ?? 0;
}
