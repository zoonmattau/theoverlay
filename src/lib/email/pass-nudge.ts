import "server-only";

import { logEvent } from "@/lib/admin";
import { hasAccess, isAdminEmail, viewerById } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { LATE_PASS_HOUR } from "@/lib/passes/late";
import { sydneyHour } from "@/lib/model/source";
import { EMAILS } from "./messages";
import { sendEmail } from "./send";
import { unsubscribeUrl } from "./unsubscribe";

const DAY = 86400_000;
const sydneyDay = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

/** Melbourne Cup day: the first Tuesday in November. */
function cupDay(year: number): string {
  for (let d = 1; d <= 7; d++) {
    const iso = `${year}-11-0${d}`;
    if (new Date(`${iso}T12:00:00Z`).getUTCDay() === 2) return iso;
  }
  return "";
}

/**
 * On a big day (every Saturday, and Melbourne Cup day), one email to anyone
 * sitting on unused day passes who does not already have the day open: you
 * have N passes, today's card is up. Passes they have paid for and not used
 * are the cheapest sale we will make, and a member who uses them comes back
 * (the user, 13 Oct 2026). At most once a week each, only to accounts that
 * ticked tips emails, never to admins, tipsters or our own addresses. Runs
 * from the midday cron with the 11am calls. These members are also kept out
 * of the win-back series.
 */
export async function nudgePasses(opts: { dry?: boolean; now?: number; force?: boolean } = {}): Promise<number> {
  const now = opts.now ?? Date.now();
  const date = sydneyDay(now);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (!opts.force && weekday !== 6 && date !== cupDay(Number(date.slice(0, 4)))) return 0;

  const db = supabaseAdmin();
  const [{ data: profs }, { data: affs }, { data: sent }] = await Promise.all([
    db.from("profiles").select("id, email, pass_credits, is_admin, paused_at").eq("marketing_opt_in", true).gt("pass_credits", 0).not("email", "is", null),
    db.from("affiliates").select("user_id").not("user_id", "is", null),
    db.from("events").select("user_id, created_at").eq("kind", "pass_nudge").gte("created_at", new Date(now - 6.5 * DAY).toISOString()),
  ]);
  const tipsters = new Set((affs ?? []).map((a) => a.user_id as string));
  const recent = new Set((sent ?? []).map((e) => e.user_id as string));
  const late = sydneyHour() >= LATE_PASS_HOUR;
  let count = 0;
  for (const p of (profs ?? []) as { id: string; email: string; pass_credits: number; is_admin: boolean | null; paused_at: string | null }[]) {
    if (p.is_admin || isAdminEmail(p.email) || tipsters.has(p.id) || recent.has(p.id) || p.paused_at || /@theoverlay\.com\.au$/i.test(p.email)) continue;
    // Already open today (a plan, a gift, or a pass spent on today): nothing to nudge.
    const viewer = await viewerById(p.id);
    if (viewer && hasAccess(viewer, date)) continue;
    if (opts.dry) {
      console.log("[pass-nudge]", p.email, p.pass_credits, "passes");
      count++;
      continue;
    }
    const spec = EMAILS.passNudge(p.pass_credits, late);
    const unsub = unsubscribeUrl(p.id);
    const ok = await sendEmail(p.email, { ...spec, note: `You get this because you ticked tips emails. <a href="${unsub}" style="color:#8b918a">Unsubscribe</a> with one click.` }, {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    if (ok) {
      await logEvent({ user_id: p.id, kind: "pass_nudge", plan: null, amount_cents: null, meta: { passes: p.pass_credits, date } });
      count++;
    }
  }
  return count;
}
