import "server-only";

import { logEvent } from "@/lib/admin";
import { isAdminEmail } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { planById, termById } from "@/lib/billing/plans";
import { EMAILS } from "./messages";
import { sendEmail } from "./send";
import { unsubscribeUrl } from "./unsubscribe";

const DAY = 86400_000;
/** Sent this long before the trial ends: day 5 of 7, with time left to use the board. */
const BEFORE = 2.5 * DAY;
/** Too close to the end to be worth it, the win-back series takes over from here. */
const TOO_LATE = 12 * 3600_000;

/**
 * One email to anyone on a yearly or 3-month trial who has booked a cancel,
 * a couple of days before the trial ends: pay the first month today, on the
 * monthly price, and it runs 5 weeks, instead of the term's bill in one go. The first two yearly trials to
 * cancel (1 Oct 2026) gave "too expensive" and "unused" within hours; the
 * cancel page makes the same offer. Once per trial, only to accounts that
 * ticked tips emails, never to admins or our own addresses. Runs from the
 * midday cron with the win-back series.
 */
export async function nudgeLongTermTrials(opts: { dry?: boolean; now?: number } = {}): Promise<number> {
  const now = opts.now ?? Date.now();
  const db = supabaseAdmin();
  const [{ data: profs }, { data: sent }] = await Promise.all([
    db
      .from("profiles")
      .select("id, email, plan, billing_term, cancel_at, is_admin")
      .eq("subscription_status", "trialing")
      .eq("marketing_opt_in", true)
      .in("billing_term", ["year", "quarter"])
      .not("cancel_at", "is", null)
      .not("email", "is", null),
    db.from("events").select("user_id, meta").eq("kind", "term_nudge"),
  ]);
  const had = new Set(((sent ?? []) as { user_id: string; meta: { ends?: string } | null }[]).map((e) => `${e.user_id}|${e.meta?.ends}`));
  let count = 0;
  for (const p of (profs ?? []) as { id: string; email: string; plan: string | null; billing_term: string; cancel_at: string; is_admin: boolean }[]) {
    if (p.is_admin || isAdminEmail(p.email) || /@theoverlay\.com\.au$/i.test(p.email)) continue;
    const ends = new Date(p.cancel_at).getTime();
    const left = ends - now;
    if (left > BEFORE || left < TOO_LATE || had.has(`${p.id}|${p.cancel_at}`)) continue;
    const plan = planById(p.plan ?? undefined);
    if (!plan) continue;
    const term = termById(p.billing_term);
    const spec = EMAILS.trialMonthly(plan.name, term.name.toLowerCase(), p.cancel_at);
    if (opts.dry) {
      console.log("[term-nudge]", p.email, plan.name, term.id, "ends", p.cancel_at.slice(0, 16));
      count++;
      continue;
    }
    const unsub = unsubscribeUrl(p.id);
    const ok = await sendEmail(p.email, { ...spec, note: `You get this because you ticked tips emails. <a href="${unsub}" style="color:#8b918a">Unsubscribe</a> with one click.` }, {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    // Logged either way, so a failed send is not retried every hour.
    await logEvent({ user_id: p.id, kind: "term_nudge", plan: plan.id, amount_cents: null, meta: { ends: p.cancel_at, term: term.id, emailed: ok } });
    if (ok) count++;
    await new Promise((res) => setTimeout(res, 600));
  }
  return count;
}
