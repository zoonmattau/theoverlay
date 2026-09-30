import "server-only";

import { logEvent } from "@/lib/admin";
import { isAdminEmail } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { planById, weekly } from "@/lib/billing/plans";
import { EMAILS, type WeekRecord } from "./messages";
import { COMEBACK_DAYS, offerComeback } from "@/lib/billing/comeback";
import { sendEmail } from "./send";
import { unsubscribeUrl } from "./unsubscribe";

const DAY = 86400_000;
type Step = 1 | 2 | 3;
/** A lapse older than this is left alone, so the first run does not email everyone who ever left. */
const FRESH_DAYS = 14;
const sydneyDay = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

/** The model's published calls over the last 7 days, settled, voids out, and the winning bets longest price first. */
async function lastWeek(now: number): Promise<WeekRecord> {
  const from = new Date(now - 7 * DAY).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin()
    .from("tips")
    .select("side, units, finish_position, market_price, horse_name, track, race_number")
    .eq("source", "model")
    .gte("date", from)
    .not("settled_at", "is", null)
    .not("finish_position", "is", null);
  const rows = (data ?? []) as { side: "back" | "lay"; units: number; finish_position: number; market_price: number; horse_name: string; track: string; race_number: number }[];
  return {
    bets: rows.filter((r) => r.side === "back").length,
    lays: rows.filter((r) => r.side === "lay").length,
    units: Math.round(rows.reduce((a, r) => a + Number(r.units), 0) * 10) / 10,
    winners: rows
      .filter((r) => r.side === "back" && r.finish_position === 1)
      .sort((a, b) => b.market_price - a.market_price)
      .map((r) => `<strong>${r.horse_name}</strong> won at $${Number(r.market_price).toFixed(2)}, ${r.track} R${r.race_number}`),
  };
}

/**
 * Three emails to a member whose access is running out and not renewing:
 * on the last day (it ends today, and the week's winners they will miss),
 * three days after it ends (come back on any plan and the first month runs
 * five weeks), and a week after (the week's winners, the extra week still
 * waiting, and the last one). A plan that renews is never emailed; coming
 * back ends the series, since the plan is live again.
 * Only to accounts that ticked tips emails, never to admins, tipsters or our
 * own addresses, and never after a `winback` event with step "skip" (set by
 * hand for anyone who should not get them). Each lapse gets its own series,
 * keyed by the date access ends. Runs from the midday cron.
 */
export async function winBack(opts: { dry?: boolean; now?: number } = {}): Promise<Record<Step, number>> {
  const now = opts.now ?? Date.now();
  const db = supabaseAdmin();
  const [{ data: profs }, { data: affs }, { data: sent }, { data: cancels }] = await Promise.all([
    db.from("profiles").select("id, email, plan, access_until, bonus_until, subscription_status, cancel_at, paused_at, is_admin").eq("marketing_opt_in", true).not("email", "is", null),
    db.from("affiliates").select("user_id").not("user_id", "is", null),
    db.from("events").select("user_id, meta").eq("kind", "winback"),
    // A subscription cancelled outright leaves access_until at 1970, so when it ended is when it was cancelled.
    db.from("events").select("user_id, created_at").eq("kind", "subscription").eq("meta->>status", "canceled"),
  ]);
  const cancelledAt = new Map<string, number>();
  for (const c of (cancels ?? []) as { user_id: string; created_at: string }[]) cancelledAt.set(c.user_id, Math.max(cancelledAt.get(c.user_id) ?? 0, new Date(c.created_at).getTime()));
  const tipsters = new Set((affs ?? []).map((a) => a.user_id));
  const skip = new Set<string>();
  const had = new Set<string>();
  for (const e of (sent ?? []) as { user_id: string; meta: { step?: number | "skip"; ended?: string } | null }[]) {
    if (e.meta?.step === "skip") skip.add(e.user_id);
    else if (e.meta?.ended) had.add(`${e.user_id}|${e.meta.ended}|${e.meta.step}`);
  }
  const out: Record<Step, number> = { 1: 0, 2: 0, 3: 0 };
  let week: WeekRecord | undefined;
  const price = planById("saturday")?.price ?? 19;

  for (const p of profs ?? []) {
    if (!p.email || p.is_admin || isAdminEmail(p.email) || tipsters.has(p.id) || skip.has(p.id) || /@theoverlay\.com\.au$/i.test(p.email) || p.paused_at) continue;
    // A subscription that renews is not ending, whatever access_until says.
    const renewing = ["active", "trialing", "past_due"].includes(p.subscription_status ?? "") && !p.cancel_at;
    if (renewing) continue;
    const until = p.access_until ? new Date(p.access_until).getTime() : 0;
    const plan = until > DAY ? until : p.plan ? (cancelledAt.get(p.id) ?? 0) : 0;
    const gift = p.bonus_until ? new Date(p.bonus_until).getTime() : 0;
    const endsAt = Math.max(plan, gift);
    if (!endsAt) continue;
    const ended = new Date(endsAt).toISOString();
    const sent = (s: Step) => had.has(`${p.id}|${ended}|${s}`);
    const since = now - endsAt;

    let step: Step | undefined;
    // The last day, then days 3 to 7 after, then day 7 on, each only once; the
    // third only after the second, so a late start never sends two in a row.
    // The midday run can land just after an 11:58 end: the same Sydney day still counts as the last day.
    if (sydneyDay(endsAt) === sydneyDay(now)) step = !sent(1) ? 1 : undefined;
    else if (since < 0) step = undefined;
    else if (since >= 3 * DAY && since < 7 * DAY && !sent(2)) step = 2;
    else if (since >= 7 * DAY && since <= FRESH_DAYS * DAY && sent(2) && !sent(3)) step = 3;
    if (!step) continue;
    if (opts.dry) {
      console.log("[winback]", step, p.email, "access ends", ended.slice(0, 16), gift >= plan ? "(gift)" : "(plan)");
      out[step]++;
      continue;
    }

    week ??= await lastWeek(now);
    // The offer goes on the account with the email that makes it, so checkout can honour it.
    if (step === 2) await offerComeback(p.id);
    const spec = step === 1 ? EMAILS.winbackEnding(gift >= plan, week) : step === 2 ? EMAILS.winbackOffer(COMEBACK_DAYS, price, `$${weekly(price).toFixed(2)}`) : EMAILS.winbackLast(week, COMEBACK_DAYS, price);
    const unsub = unsubscribeUrl(p.id);
    const ok = await sendEmail(p.email, { ...spec, note: `${spec.note ? `${spec.note} ` : ""}You get this because you ticked tips emails. <a href="${unsub}" style="color:#8b918a">Unsubscribe</a> with one click.` }, {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    // Logged either way, so a failed send is not retried every hour.
    await logEvent({ user_id: p.id, kind: "winback", plan: null, amount_cents: null, meta: { step, ended, emailed: ok } });
    if (ok) out[step]++;
    await new Promise((res) => setTimeout(res, 600));
  }
  return out;
}
