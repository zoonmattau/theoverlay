import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
const secret = () => process.env.UNSUBSCRIBE_SECRET ?? process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "overlay";

/** A signed, no-login link that turns tips emails off for one member. */
export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(userId: string): string {
  return `${SITE}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}

export function unsubscribeTokenValid(userId: string, token: string): boolean {
  const want = Buffer.from(unsubscribeToken(userId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}
