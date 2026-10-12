// Tells every member moved by scripts/reprice.ts what their next bill will be
// (the user, 12 Oct 2026: say the next bill, nothing about when it changed).
// Skips anyone cancelling (no next bill), admins and our own addresses; once
// per member, logged as price_notice.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/reprice-email.ts         (dry run)
//   NEXT_PUBLIC_SITE_URL=https://theoverlay.com.au npx tsx --conditions=react-server --env-file=.env.local scripts/reprice-email.ts --go
import { logEvent } from "../src/lib/admin";
import { isAdminEmail } from "../src/lib/auth";
import { supabaseAdmin } from "../src/lib/billing/access";
import { billingTerm, planById, termById, termPrice } from "../src/lib/billing/plans";
import { stripe } from "../src/lib/billing/stripe";
import { EMAILS } from "../src/lib/email/messages";
import { sendEmail } from "../src/lib/email/send";

const go = process.argv.includes("--go");

(async () => {
  const db = supabaseAdmin();
  const [{ data: profs }, { data: sent }] = await Promise.all([
    db.from("profiles").select("id, email, is_admin, stripe_subscription_id"),
    db.from("events").select("user_id").eq("kind", "price_notice"),
  ]);
  const done = new Set((sent ?? []).map((e) => e.user_id));
  const who = new Map((profs ?? []).map((p) => [p.stripe_subscription_id, p]));
  let n = 0;
  for (const status of ["trialing", "active", "past_due"] as const) {
    for await (const sub of stripe().subscriptions.list({ status, limit: 100 })) {
      const p = who.get(sub.id);
      const plan = planById(sub.metadata?.plan);
      const term = termById(billingTerm(sub.items.data[0]?.price.recurring) ?? sub.metadata?.term);
      if (!p?.email || !plan || !sub.metadata?.repriced || done.has(p.id)) continue;
      if (sub.cancel_at || sub.cancel_at_period_end || p.is_admin || isAdminEmail(p.email) || /@theoverlay\.com\.au$/i.test(p.email)) continue;
      const bill = `$${termPrice(plan, term)} ${term.every}`;
      console.log(go ? "SEND " : "would", p.email.padEnd(34), plan.name.padEnd(22), bill);
      if (!go) continue;
      const ok = await sendEmail(p.email, EMAILS.priceChange(plan.name, bill));
      await logEvent({ user_id: p.id, kind: "price_notice", plan: plan.id, amount_cents: termPrice(plan, term) * 100, meta: { emailed: ok, term: term.id } });
      n++;
    }
  }
  console.log(go ? `sent ${n}` : "dry run, --go to send");
})();
