import "server-only";

import { logEvent } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
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
 * The rest of today, or through tomorrow when it is past 5pm and today's
 * racing is nearly done, on top of any gift already running.
 */
export async function claimInstagramDay(userId: string, handle: string): Promise<{ ok: boolean; until?: string }> {
  if (await claimedInstagramDay(userId)) return { ok: false };
  const db = supabaseAdmin();
  const { data: p } = await db.from("profiles").select("bonus_until").eq("id", userId).maybeSingle();
  const now = Date.now();
  const day = sydneyHour(now) >= 17 ? sydneyDate(now + 86400_000) : sydneyDate(now);
  const end = new Date(endOfSydneyDay(day)).getTime();
  const current = p?.bonus_until ? new Date(p.bonus_until).getTime() : 0;
  // On top of a gift that runs past today, the day goes on the end of it.
  const until = new Date(current > now ? Math.max(end, current + 86400_000) : end).toISOString();
  await db.from("profiles").update({ bonus_until: until }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "ig_follow_claim", plan: null, amount_cents: null, meta: { handle: handle.replace(/^@/, "").trim().slice(0, 40) || null, until } });
  await syncDiscordMember(userId).catch(() => {});
  return { ok: true, until };
}
