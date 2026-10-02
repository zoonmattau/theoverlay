// Where accounts come from: every profile with its source, landing, referrer,
// utm tags and what it has paid. Writes signups.json beside this file.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/signups.ts
import { writeFileSync } from "node:fs";
import { supabaseAdmin } from "../../src/lib/billing/access";
(async () => {
  const db = supabaseAdmin();
  const { data: profiles, error } = await db.from("profiles").select("id, created_at, source, landing, referrer, utm, plan, subscription_status, access_until, cancel_at, pass_credits, total_spent_cents, affiliate_id, is_admin, subscribed_since").order("created_at");
  if (error) throw error;
  const { data: events } = await db.from("events").select("user_id, kind, plan, amount_cents, created_at").in("kind", ["payment", "checkout_completed"]);
  const { data: affs } = await db.from("affiliates").select("id, name, code");
  writeFileSync("marketing/analysis/signups.json", JSON.stringify({ profiles, events, affs }, null, 1));
  console.log(profiles?.length, "profiles,", events?.length, "payment events");
})();
