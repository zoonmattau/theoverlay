import "server-only";

import { supabaseAdmin } from "./access";
import { planById } from "./plans";
import { EMAILS } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";

/**
 * A member whose payment fails keeps the board for a week while Stripe
 * retries, then loses it, and is reminded to pay three times in that week
 * without being told when (the user, 26 Sep 2026). The week is an event,
 * payment_grace, written the first time the subscription is seen past due;
 * one written before the subscription was last active belongs to an earlier
 * failure and does not count.
 */
export const GRACE_DAYS = 7;
/** Days into the grace week that each reminder goes out. */
export const REMINDER_DAYS = [0, 3, 6];

const DAY = 24 * 60 * 60_000;

interface Grace {
  since: string;
  until: Date;
}

/** The grace week running for this member's current failure, if one has started. */
async function currentGrace(userId: string): Promise<Grace | undefined> {
  const db = supabaseAdmin();
  const [{ data: grace }, { data: subs }] = await Promise.all([
    db.from("events").select("created_at, meta").eq("user_id", userId).eq("kind", "payment_grace").order("created_at", { ascending: false }).limit(1),
    db.from("events").select("created_at, meta").eq("user_id", userId).eq("kind", "subscription").order("created_at", { ascending: false }).limit(50),
  ]);
  const g = grace?.[0];
  if (!g) return undefined;
  const lastPaid = (subs ?? []).find((s) => ["active", "trialing"].includes(String((s.meta as { status?: string } | null)?.status)))?.created_at;
  if (lastPaid && lastPaid > g.created_at) return undefined;
  return { since: g.created_at, until: new Date(String((g.meta as { until?: string } | null)?.until)) };
}

/** When a past-due member's access ends: the grace week, started now if this failure has none yet. */
export async function graceUntil(userId: string, days = GRACE_DAYS): Promise<Date> {
  const running = await currentGrace(userId);
  if (running) return running.until;
  const until = new Date(Date.now() + days * DAY);
  const { error } = await supabaseAdmin().from("events").insert({ user_id: userId, kind: "payment_grace", plan: null, amount_cents: null, meta: { until: until.toISOString() } });
  if (error) console.error("[grace]", error.message);
  return until;
}

/**
 * Sends each past-due member the reminder now due, once: the first on the day
 * the grace week starts, then on day three and day six. Run from the midday
 * cron. Returns the emails sent.
 */
export async function remindUnpaid(): Promise<number> {
  const db = supabaseAdmin();
  const { data: members, error } = await db.from("profiles").select("id, email, plan").eq("subscription_status", "past_due");
  if (error) {
    console.error("[grace] members", error.message);
    return 0;
  }
  let sent = 0;
  for (const m of members ?? []) {
    const grace = await currentGrace(m.id);
    if (!grace || !m.email || Date.now() >= grace.until.getTime()) continue;
    const days = (Date.now() - new Date(grace.since).getTime()) / DAY;
    const due = REMINDER_DAYS.filter((d) => days >= d).length;
    if (due === 0) continue;
    const { data: done } = await db.from("events").select("meta").eq("user_id", m.id).eq("kind", "payment_reminder").gte("created_at", grace.since);
    const already = (done ?? []).length;
    if (already >= due) continue;
    const n = already + 1;
    const ok = await sendEmail(m.email, EMAILS.paymentReminder(planById(m.plan ?? "")?.name ?? "Overlay", n === REMINDER_DAYS.length));
    if (!ok) continue;
    await db.from("events").insert({ user_id: m.id, kind: "payment_reminder", plan: m.plan, amount_cents: null, meta: { n } });
    sent++;
  }
  return sent;
}
