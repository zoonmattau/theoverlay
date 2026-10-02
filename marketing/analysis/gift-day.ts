// Gift days of the full board the way the admin "Add days" button does: bonus_until on top of
// what they have, an admin event, the Discord role re-synced and the "free days" email.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/gift-day.ts <days> <userId> [userId...]
import { logEvent } from "../../src/lib/admin";
import { supabaseAdmin } from "../../src/lib/billing/access";
import { syncDiscordMember } from "../../src/lib/discord";
import { EMAILS } from "../../src/lib/email/messages";
import { sendEmail } from "../../src/lib/email/send";
(async () => {
  const [daysArg, ...ids] = process.argv.slice(2);
  const days = Number(daysArg);
  const db = supabaseAdmin();
  for (const id of ids) {
    const { data } = await db.from("profiles").select("bonus_until, email, full_name").eq("id", id).maybeSingle();
    const base = data?.bonus_until && new Date(data.bonus_until).getTime() > Date.now() ? new Date(data.bonus_until) : new Date();
    const until = new Date(base.getTime() + days * 86400_000);
    await db.from("profiles").update({ bonus_until: until.toISOString() }).eq("id", id);
    await logEvent({ user_id: id, kind: "admin", plan: null, amount_cents: null, meta: { action: "add_days", days, by: "matthew.parker@live.com.au", note: "Friday gift for a Saturday yearly trial that cancelled" } });
    await syncDiscordMember(id);
    const sent = data?.email ? await sendEmail(data.email, EMAILS.daysAdded(days, until.toISOString())) : false;
    console.log(data?.full_name, "bonus until", until.toLocaleString("en-AU", { timeZone: "Australia/Sydney" }), "emailed", sent);
  }
})();
