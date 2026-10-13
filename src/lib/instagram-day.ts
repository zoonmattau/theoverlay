import "server-only";

import { logEvent } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { stripe } from "@/lib/billing/stripe";
import { syncDiscordMember } from "@/lib/discord";

/**
 * A free day for following us on Instagram, for members on a plan only since
 * plans stopped having a free trial (13 Oct 2026): a free day for anyone was a
 * way round paying. Instagram will not tell us who follows, so the member says
 * they did and gives their handle for a spot check. Once per account, ever,
 * logged as ig_follow_claim.
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
 * The next bill (or the trial's end) moves a day later, since a free day
 * inside paid access is worth nothing. A plan booked to end gets the day on
 * the end of its access instead: the rest of that day, or through the next
 * when it is past 5pm and the racing is nearly done. No plan, no day.
 */
export async function claimInstagramDay(userId: string, handle: string): Promise<{ ok: boolean; reason?: "claimed" | "plan"; until?: string; billDelayed?: boolean }> {
  if (await claimedInstagramDay(userId)) return { ok: false, reason: "claimed" };
  const db = supabaseAdmin();
  const { data: p } = await db.from("profiles").select("access_until, bonus_until, stripe_subscription_id, subscription_status").eq("id", userId).maybeSingle();
  if (!p?.stripe_subscription_id || !["active", "trialing"].includes(p.subscription_status ?? "")) return { ok: false, reason: "plan" };
  const now = Date.now();
  const tag = handle.replace(/^@/, "").trim().slice(0, 40) || null;
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

export interface InstagramClaim {
  userId: string;
  who: string;
  handle: string | null;
  at: string;
  /** The free day's end, or the bill it moved back. */
  until?: string;
  nextBill?: string;
  takenBack: boolean;
}

/** Claims from the last `days` days, newest first, for the spot check on the admin overview. */
export async function instagramClaims(days = 30): Promise<InstagramClaim[]> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [{ data: claims }, { data: revoked }] = await Promise.all([
    db.from("events").select("user_id, created_at, meta").eq("kind", "ig_follow_claim").gte("created_at", since).order("created_at", { ascending: false }),
    db.from("events").select("user_id").eq("kind", "ig_follow_revoked"),
  ]);
  const ids = [...new Set((claims ?? []).map((c) => c.user_id as string))];
  const { data: profs } = ids.length ? await db.from("profiles").select("id, email, full_name").in("id", ids) : { data: [] };
  const who = new Map((profs ?? []).map((p) => [p.id as string, (p.full_name || p.email || "a member") as string]));
  const gone = new Set((revoked ?? []).map((r) => r.user_id as string));
  return ((claims ?? []) as { user_id: string; created_at: string; meta: { handle?: string | null; until?: string; nextBill?: string } | null }[]).map((c) => ({
    userId: c.user_id,
    who: who.get(c.user_id) ?? "a member",
    handle: c.meta?.handle ?? null,
    at: c.created_at,
    until: c.meta?.until,
    nextBill: c.meta?.nextBill,
    takenBack: gone.has(c.user_id),
  }));
}

/**
 * Takes the free day back from someone who does not follow us after all
 * (the user, 12 Oct 2026): a gift day comes off the end of their gift, a
 * moved bill moves back a day (or bills now if that day has passed). The
 * claim stands, so they cannot claim again.
 */
export async function revokeInstagramDay(userId: string, by: string): Promise<boolean> {
  const db = supabaseAdmin();
  const [{ data: claim }, { data: done }] = await Promise.all([
    db.from("events").select("meta").eq("kind", "ig_follow_claim").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("events").select("id").eq("kind", "ig_follow_revoked").eq("user_id", userId).limit(1),
  ]);
  if (!claim || (done ?? []).length) return false;
  const meta = (claim.meta ?? {}) as { until?: string; nextBill?: string };
  if (meta.nextBill) {
    const { data: p } = await db.from("profiles").select("stripe_subscription_id").eq("id", userId).maybeSingle();
    if (p?.stripe_subscription_id) {
      const sub = await stripe().subscriptions.retrieve(p.stripe_subscription_id);
      const moved = Math.floor(new Date(meta.nextBill).getTime() / 1000);
      // Only while the bill is still where the claim put it; anything since (a payment, a plan change) stands.
      if (sub.status === "trialing" && sub.trial_end === moved) {
        const back = moved - 86400;
        await stripe().subscriptions.update(sub.id, { trial_end: back > Date.now() / 1000 + 60 ? back : "now", proration_behavior: "none" });
      }
    }
  } else if (meta.until) {
    const { data: p } = await db.from("profiles").select("bonus_until").eq("id", userId).maybeSingle();
    if (p?.bonus_until && Math.abs(new Date(p.bonus_until).getTime() - new Date(meta.until).getTime()) < 60_000) {
      const back = new Date(meta.until).getTime() - 86400_000;
      await db.from("profiles").update({ bonus_until: back > Date.now() ? new Date(back).toISOString() : null }).eq("id", userId);
    }
  }
  await logEvent({ user_id: userId, kind: "ig_follow_revoked", plan: null, amount_cents: null, meta: { by } });
  await syncDiscordMember(userId).catch(() => {});
  return true;
}
