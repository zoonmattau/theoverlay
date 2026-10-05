import "server-only";

import { supabaseAdmin } from "./access";
import { planById } from "./plans";
import { EMAILS } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";
import { monthlyFor, weeklyFor } from "./retention";

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
 * the grace week starts, then on day three and day six. The first is normally
 * the webhook's, on Stripe's first failed attempt (logged as reminder 1 just
 * before the grace week opens, hence the day's slack), so this sends the
 * other two. The day the week runs out, one more says the board is closed.
 * Run from the midday cron. Returns the emails sent.
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
    if (!grace || !m.email) continue;
    // The week is up and the payment still owed: one email that the board is closed, then
    // nothing until Stripe gives up and the win-back series takes over.
    if (Date.now() >= grace.until.getTime()) {
      const { data: closed } = await db.from("events").select("id").eq("user_id", m.id).eq("kind", "payment_closed").gte("created_at", grace.since).limit(1);
      if ((closed ?? []).length > 0) continue;
      const ok = await sendEmail(m.email, await closedEmail(m.id));
      await db.from("events").insert({ user_id: m.id, kind: "payment_closed", plan: m.plan, amount_cents: null, meta: { emailed: ok } });
      if (ok) sent++;
      continue;
    }
    const days = (Date.now() - new Date(grace.since).getTime()) / DAY;
    const due = REMINDER_DAYS.filter((d) => days >= d).length;
    if (due === 0) continue;
    const { data: done } = await db.from("events").select("meta").eq("user_id", m.id).eq("kind", "payment_reminder").gte("created_at", new Date(new Date(grace.since).getTime() - DAY).toISOString());
    const already = (done ?? []).length;
    if (already >= due) continue;
    const n = already + 1;
    const ok = await sendEmail(m.email, await failedPaymentEmail(m.id, n));
    if (!ok) continue;
    await db.from("events").insert({ user_id: m.id, kind: "payment_reminder", plan: m.plan, amount_cents: null, meta: { n } });
    sent++;
  }
  return sent;
}

/**
 * Email n of the three for a failed payment: the first from the webhook on
 * Stripe's first failed attempt, the other two from remindUnpaid. A yearly or
 * 3-month first bill gets the month-free and pay-monthly offers instead.
 */
export async function failedPaymentEmail(userId: string, n: number) {
  const last = n === REMINDER_DAYS.length;
  const offer = await monthlyFor(userId).catch(() => null);
  if (offer?.failedInvoice) return EMAILS.termFailedMonthly(offer.planName, offer.term.name.toLowerCase(), offer.term.months, last);
  const { data } = await supabaseAdmin().from("profiles").select("plan").eq("id", userId).maybeSingle();
  const plan = planById(data?.plan ?? "")?.name ?? "Overlay";
  // A failed monthly bill also gets the weekly way to stay (5 Oct 2026).
  const weekly = (await weeklyFor(userId).catch(() => null))?.failedInvoice ? planById(data?.plan ?? "")?.weekPrice : undefined;
  return n === 1 ? EMAILS.paymentFailed(plan, weekly) : EMAILS.paymentReminder(plan, last, weekly);
}

/** The board-closed email, with the month-free and monthly offers for a failed long-term first bill. */
async function closedEmail(userId: string) {
  const offer = await monthlyFor(userId).catch(() => null);
  if (offer?.failedInvoice) return EMAILS.termClosed(offer.planName, offer.term.months);
  const { data } = await supabaseAdmin().from("profiles").select("plan").eq("id", userId).maybeSingle();
  return EMAILS.paymentClosed(planById(data?.plan ?? "")?.name ?? "Overlay");
}
