import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

import { logEvent } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { syncDiscordMember } from "@/lib/discord";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
const secret = () => `${process.env.UNSUBSCRIBE_SECRET ?? process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "overlay"}:free-days`;

/** Free days a lapsed member can claim from a win-back email, once. */
export const FREE_DAYS = 3;

const token = (userId: string) => createHmac("sha256", secret()).update(userId).digest("hex").slice(0, 32);

/** A signed, no-login link that gives one member their free days back. */
export function freeDaysUrl(userId: string): string {
  return `${SITE}/api/email/free-days?u=${encodeURIComponent(userId)}&t=${token(userId)}`;
}

export function freeDaysTokenValid(userId: string, t: string): boolean {
  const want = Buffer.from(token(userId));
  const got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Who has claimed the free days already: each member gets them once, ever. */
export async function claimedFreeDays(): Promise<Set<string>> {
  const { data } = await supabaseAdmin().from("events").select("user_id").eq("kind", "free_days_claim");
  return new Set((data ?? []).map((e) => e.user_id as string));
}

/**
 * Adds the free days on top of any gift still running, logs the claim and
 * gives the Discord role back. "claimed" when it was already used, "live"
 * when they have a plan running and need nothing.
 */
export async function claimFreeDays(userId: string): Promise<{ result: "added" | "claimed" | "live" | "missing"; until?: string }> {
  const db = supabaseAdmin();
  const { data: p } = await db.from("profiles").select("access_until, bonus_until, subscription_status").eq("id", userId).maybeSingle();
  if (!p) return { result: "missing" };
  if ((await claimedFreeDays()).has(userId)) return { result: "claimed", until: p.bonus_until ?? undefined };
  const now = Date.now();
  if (p.access_until && new Date(p.access_until).getTime() > now && ["active", "trialing"].includes(p.subscription_status ?? "")) return { result: "live" };
  const from = Math.max(now, p.bonus_until ? new Date(p.bonus_until).getTime() : 0);
  const until = new Date(from + FREE_DAYS * 86400_000).toISOString();
  await db.from("profiles").update({ bonus_until: until }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "free_days_claim", plan: null, amount_cents: null, meta: { days: FREE_DAYS, until } });
  await syncDiscordMember(userId).catch(() => {});
  return { result: "added", until };
}
