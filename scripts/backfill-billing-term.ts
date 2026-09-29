// Sets profiles.billing_term from each member's Stripe subscription, once,
// for subscriptions made before the webhook kept it (30 Sep 2026).
// npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-billing-term.ts [--write]
import { supabaseAdmin } from "../src/lib/billing/access";
import { billingTerm } from "../src/lib/billing/plans";
import { stripe } from "../src/lib/billing/stripe";

(async () => {
  const write = process.argv.includes("--write");
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("id, email, plan, subscription_status, stripe_subscription_id").not("stripe_subscription_id", "is", null);
  for (const p of data ?? []) {
    const sub = await stripe().subscriptions.retrieve(p.stripe_subscription_id);
    const term = sub.status === "canceled" ? null : billingTerm(sub.items.data[0]?.price.recurring);
    console.log((p.email ?? "").padEnd(34), (p.plan ?? "-").padEnd(10), sub.status.padEnd(9), term ?? "-", write ? "(written)" : "");
    if (write) {
      const { error } = await db.from("profiles").update({ billing_term: term }).eq("id", p.id);
      if (error) console.error(error.message);
    }
  }
})();
