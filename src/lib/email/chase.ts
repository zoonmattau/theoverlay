import "server-only";

import { logEvent } from "@/lib/admin";
import { isAdminEmail } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { EMAILS } from "./messages";
import { sendEmail } from "./send";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
const DAY = 86400_000;
/** The trial an account gets once chased, in place of the usual seven days. */
export const CHASE_TRIAL_DAYS = 10;

type Step = "confirm" | "offer" | "last";

/**
 * Chases the accounts that stalled, one email per step, each at most once:
 * - confirm: never confirmed the email, a day on. A fresh link, and the longer trial.
 * - offer: confirmed, never had a plan, two days on. The longer trial.
 * - last: still nothing, five days after the offer. Then we stop.
 * The offer and the last call go only to accounts that ticked tips emails
 * (an unsubscribe turns them off); a confirm link goes to anyone. Admins,
 * tipsters, our own addresses, anyone admin-invited and anyone who has ever
 * had access are left alone. Runs from the midday cron.
 */
export async function chaseSignups(opts: { dry?: boolean; now?: number } = {}): Promise<Record<Step, number>> {
  const now = opts.now ?? Date.now();
  const db = supabaseAdmin();
  const [{ data: users }, { data: profs }, { data: affs }, { data: chased }, { data: nudged }] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from("profiles").select("id, email, plan, access_until, bonus_until, is_admin, marketing_opt_in, created_at"),
    db.from("affiliates").select("user_id").not("user_id", "is", null),
    // The hand-run nudge of 18 Sep 2026 logged as admin actions; those count as sent.
    db.from("events").select("user_id, created_at, meta").or("kind.eq.signup_chase,meta->>action.eq.nudge_confirm,meta->>action.eq.nudge_trial"),
    db.from("events").select("user_id").eq("kind", "checkout_nudge").gte("created_at", new Date(now - 5 * DAY).toISOString()),
  ]);
  // Someone sent the 25%-off checkout email in the last five days is not offered a longer trial on top.
  const checkoutNudged = new Set((nudged ?? []).map((e) => e.user_id as string));
  const auth = new Map((users?.users ?? []).map((u) => [u.id, u]));
  const tipsters = new Set((affs ?? []).map((a) => a.user_id));
  const done = new Map<string, Map<Step, number>>();
  for (const e of (chased ?? []) as { user_id: string; created_at: string; meta: { step?: Step; action?: string } | null }[]) {
    const step: Step | undefined = e.meta?.step ?? (e.meta?.action === "nudge_confirm" ? "confirm" : e.meta?.action === "nudge_trial" ? "offer" : undefined);
    if (!step) continue;
    const m = done.get(e.user_id) ?? new Map<Step, number>();
    m.set(step, new Date(e.created_at).getTime());
    done.set(e.user_id, m);
  }
  const sent: Record<Step, number> = { confirm: 0, offer: 0, last: 0 };

  for (const p of profs ?? []) {
    const u = auth.get(p.id);
    if (!u || !p.email || p.is_admin || isAdminEmail(p.email) || tipsters.has(p.id) || /@theoverlay\.com\.au$/i.test(p.email)) continue;
    if (u.invited_at || p.plan || p.access_until || p.bonus_until || checkoutNudged.has(p.id)) continue;
    const age = now - new Date(p.created_at).getTime();
    const had = done.get(p.id) ?? new Map<Step, number>();

    let step: Step | undefined;
    if (!u.email_confirmed_at) step = age >= DAY && !had.has("confirm") ? "confirm" : undefined;
    else if (!p.marketing_opt_in) step = undefined;
    else if (!had.has("offer")) step = age >= 2 * DAY ? "offer" : undefined;
    else if (!had.has("last") && now - had.get("offer")! >= 5 * DAY) step = "last";
    if (!step) continue;
    if (opts.dry) {
      console.log("[chase]", step, p.email);
      sent[step]++;
      continue;
    }

    // The longer trial is written on the account, and checkout honours it.
    await db.auth.admin.updateUserById(p.id, { app_metadata: { ...u.app_metadata, trial_days: CHASE_TRIAL_DAYS } });
    let ok = false;
    if (step === "confirm") {
      const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: p.email, options: { redirectTo: `${SITE}/auth/confirm` } });
      if (error || !data.properties) continue;
      const link = `${SITE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/pricing")}`;
      ok = await sendEmail(p.email, EMAILS.finishSignup(link, CHASE_TRIAL_DAYS));
    } else {
      ok = await sendEmail(p.email, step === "offer" ? EMAILS.trialExtended(CHASE_TRIAL_DAYS) : EMAILS.trialLastCall(CHASE_TRIAL_DAYS));
    }
    // Logged either way, so a failed send is not retried every hour.
    await logEvent({ user_id: p.id, kind: "signup_chase", plan: null, amount_cents: null, meta: { step, emailed: ok, days: CHASE_TRIAL_DAYS } });
    if (ok) sent[step]++;
    await new Promise((res) => setTimeout(res, 600));
  }
  return sent;
}
