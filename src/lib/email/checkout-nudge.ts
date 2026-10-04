import "server-only";

import { logEvent } from "@/lib/admin";
import { isAdminEmail } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { offerFirstMonth } from "@/lib/billing/first-month";
import { planById } from "@/lib/billing/plans";
import { EMAILS } from "./messages";
import { sendEmail } from "./send";
import { unsubscribeUrl } from "./unsubscribe";

const DAY = 86400_000;

/** Midnight Sydney at the end of the day `t` falls on. */
function sydneyMidnightAfter(t: number): Date {
  const day = new Date(t).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const noon = new Date(`${day}T12:00:00Z`);
  const hour = Number(noon.toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hour12: false }));
  return new Date(noon.getTime() - hour * 3600_000 + DAY);
}

/**
 * One email to anyone who opened a plan checkout and did not finish, the day
 * after: finish today and the first month is 25% off, until midnight. Once
 * per person ever. Only to accounts that ticked tips emails, never to admins,
 * tipsters, our own addresses, or anyone with a live plan. Pass checkouts are
 * left alone. Runs from the midday cron. 8 unfinished checkouts by 4 Oct 2026,
 * 5 of them on the yearly price.
 */
export async function nudgeCheckouts(opts: { dry?: boolean; now?: number } = {}): Promise<number> {
  const now = opts.now ?? Date.now();
  const db = supabaseAdmin();
  const [{ data: starts }, { data: subs }, { data: sent }, { data: affs }] = await Promise.all([
    db.from("events").select("user_id, created_at, plan").eq("kind", "checkout_started").gte("created_at", new Date(now - 2 * DAY).toISOString()).not("user_id", "is", null),
    db.from("events").select("user_id, created_at").eq("kind", "subscription").gte("created_at", new Date(now - 3 * DAY).toISOString()),
    db.from("events").select("user_id").eq("kind", "checkout_nudge"),
    db.from("affiliates").select("user_id").not("user_id", "is", null),
  ]);
  const had = new Set((sent ?? []).map((e) => e.user_id as string));
  const tipsters = new Set((affs ?? []).map((a) => a.user_id as string));
  // Each person's latest plan checkout, so a second try today restarts their day.
  const latest = new Map<string, { at: number; plan: string }>();
  for (const e of (starts ?? []) as { user_id: string; created_at: string; plan: string | null }[]) {
    if (!e.plan || e.plan.startsWith("passes")) continue;
    const at = new Date(e.created_at).getTime();
    if (at > (latest.get(e.user_id)?.at ?? 0)) latest.set(e.user_id, { at, plan: e.plan });
  }
  let count = 0;
  for (const [userId, start] of latest) {
    const age = now - start.at;
    if (age < DAY || age >= 2 * DAY || had.has(userId) || tipsters.has(userId)) continue;
    if ((subs ?? []).some((s) => s.user_id === userId && new Date(s.created_at).getTime() >= start.at - 60_000)) continue;
    const { data: p } = await db.from("profiles").select("email, is_admin, marketing_opt_in, subscription_status").eq("id", userId).maybeSingle();
    if (!p?.email || p.is_admin || isAdminEmail(p.email) || /@theoverlay\.com\.au$/i.test(p.email) || !p.marketing_opt_in) continue;
    if (["active", "trialing", "past_due"].includes(p.subscription_status ?? "")) continue;
    const plan = planById(start.plan.replace(/_(quarter|year)$/, ""));
    if (!plan) continue;
    // Anyone who has had a subscription before pays from day one; the email should not promise a trial.
    const trial = !p.subscription_status;
    if (opts.dry) {
      console.log("[checkout-nudge]", p.email, start.plan, new Date(start.at).toISOString().slice(0, 16), trial ? "trial" : "no trial");
      count++;
      continue;
    }
    await offerFirstMonth(userId, sydneyMidnightAfter(now));
    const spec = EMAILS.checkoutNudge(plan.name, trial);
    const unsub = unsubscribeUrl(userId);
    const ok = await sendEmail(p.email, { ...spec, note: `${spec.note} You get this because you ticked tips emails. <a href="${unsub}" style="color:#8b918a">Unsubscribe</a> with one click.` }, {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    // Logged either way, so a failed send is not retried every hour.
    await logEvent({ user_id: userId, kind: "checkout_nudge", plan: start.plan, amount_cents: null, meta: { opened: new Date(start.at).toISOString(), emailed: ok } });
    if (ok) count++;
    await new Promise((res) => setTimeout(res, 600));
  }
  return count;
}
