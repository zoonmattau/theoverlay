import "server-only";

import { logEvent } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { stripe } from "@/lib/billing/stripe";
import { syncDiscordMember } from "@/lib/discord";

/**
 * A free day for following us on Instagram. Instagram will not tell us who
 * follows, so the member says they did and gives their handle for a spot
 * check. Once per account, ever, logged as ig_follow_claim.
 */

const sydneyDate = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const sydneyHour = (t: number) => Number(new Date(t).toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hour12: false }));

/** Midnight Sydney at the end of the given date, as an ISO string. */
function endOfSydneyDay(date: string): string {
  // Sydney is UTC+10 or +11; find the UTC instant whose Sydney date first rolls past `date`.
  const guess = new Date(`${date}T14:00:00Z`).getTime();
  for (let t = guess - 3 * 3600_000; t <= guess + 3 * 3600_000; t += 3600_000) if (sydneyDate(t) !== date) return new Date(t).toISOString();
  return new Date(guess).toISOString();
}

export async function claimedInstagramDay(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("events").select("id").eq("kind", "ig_follow_claim").eq("user_id", userId).limit(1);
  return Boolean(data?.length);
}

/**
 * On a plan, the next bill (or the trial's end) moves a day later, since a
 * free day inside paid access is worth nothing. Without one, the rest of
 * today, or through tomorrow when it is past 5pm and today's racing is
 * nearly done, on top of any gift already running.
 */
export async function claimInstagramDay(userId: string, handle: string): Promise<{ ok: boolean; until?: string; billDelayed?: boolean }> {
  if (await claimedInstagramDay(userId)) return { ok: false };
  const db = supabaseAdmin();
  const { data: p } = await db.from("profiles").select("access_until, bonus_until, stripe_subscription_id, subscription_status").eq("id", userId).maybeSingle();
  const now = Date.now();
  const tag = handle.replace(/^@/, "").trim().slice(0, 40) || null;
  if (p?.stripe_subscription_id && ["active", "trialing"].includes(p.subscription_status ?? "")) {
    const sub = await stripe().subscriptions.retrieve(p.stripe_subscription_id);
    const next = sub.status === "trialing" && sub.trial_end ? sub.trial_end : sub.items.data[0]?.current_period_end;
    if (next && !sub.cancel_at && !sub.cancel_at_period_end) {
      const moved = next + 86400;
      // A trial end on the subscription, with no proration, is the free day; the webhook carries the new date.
      await stripe().subscriptions.update(sub.id, { trial_end: moved, proration_behavior: "none" });
      const until = new Date(moved * 1000).toISOString();
      await logEvent({ user_id: userId, kind: "ig_follow_claim", plan: null, amount_cents: null, meta: { handle: tag, nextBill: until } });
      return { ok: true, until, billDelayed: true };
    }
  }
  const day = sydneyHour(now) >= 17 ? sydneyDate(now + 86400_000) : sydneyDate(now);
  const end = new Date(endOfSydneyDay(day)).getTime();
  // Access already running past today (a gift, or a cancelled plan's last paid days): the day goes on the end of it.
  const current = Math.max(p?.bonus_until ? new Date(p.bonus_until).getTime() : 0, p?.access_until ? new Date(p.access_until).getTime() : 0);
  const until = new Date(current > now ? Math.max(end, current + 86400_000) : end).toISOString();
  await db.from("profiles").update({ bonus_until: until }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "ig_follow_claim", plan: null, amount_cents: null, meta: { handle: tag, until } });
  await syncDiscordMember(userId).catch(() => {});
  return { ok: true, until };
}
