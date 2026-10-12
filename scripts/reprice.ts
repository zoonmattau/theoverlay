// Moves every live subscription onto the current prices (plans.ts and the
// STRIPE_PRICE_* env), same plan, same term. Nothing is charged now and
// nothing is prorated: the next bill, whether a trial's first or a renewal,
// is the new price. Bills already raised (a past-due invoice) are left alone.
// The user, 12 Oct 2026: no member stays on the launch prices.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/reprice.ts         (dry run)
//   npx tsx --conditions=react-server --env-file=.env.local scripts/reprice.ts --go
import { logEvent } from "../src/lib/admin";
import { supabaseAdmin } from "../src/lib/billing/access";
import { billingTerm, planById, termById, termPrice, termPriceId } from "../src/lib/billing/plans";
import { stripe } from "../src/lib/billing/stripe";

const go = process.argv.includes("--go");

(async () => {
  const s = stripe();
  const { data: profs } = await supabaseAdmin().from("profiles").select("id, email, stripe_subscription_id");
  const who = new Map((profs ?? []).map((p) => [p.stripe_subscription_id, p]));
  let moved = 0;
  for (const status of ["trialing", "active", "past_due"] as const) {
    for await (const sub of s.subscriptions.list({ status, limit: 100 })) {
      const item = sub.items.data[0];
      const plan = planById(sub.metadata?.plan);
      const term = termById(billingTerm(item?.price.recurring) ?? sub.metadata?.term);
      const target = plan ? termPriceId(plan, term) : undefined;
      const p = who.get(sub.id);
      const next = sub.status === "trialing" && sub.trial_end ? sub.trial_end : item?.current_period_end;
      const line = `${(p?.email ?? sub.customer).toString().padEnd(34)} ${String(plan?.id).padEnd(9)} ${term.id.padEnd(7)} ${sub.status.padEnd(9)} next ${next ? new Date(next * 1000).toISOString().slice(0, 16) : "-"}${sub.cancel_at || sub.cancel_at_period_end ? " (cancelling)" : ""}`;
      if (!item || !plan || !target) {
        console.log("SKIP ", line, "no plan or price");
        continue;
      }
      if (item.price.id === target) {
        // --overdue: a past-due bill raised at the old price is replaced by one at the new
        // price (the user, 12 Oct 2026: retries too). The new bill is raised first and the old
        // voided after, so the subscription never reads paid up and the grace week runs on.
        if (!process.argv.includes("--overdue") || sub.status !== "past_due") continue;
        const open = (await s.invoices.list({ subscription: sub.id, status: "open", limit: 5 })).data.filter((i) => i.amount_due !== termPrice(plan, term) * 100);
        if (open.length === 0) continue;
        console.log(go ? "REBILL" : "would rebill", line, open.map((i) => `${i.id} $${i.amount_due / 100}`).join(", "), `-> $${termPrice(plan, term)}`);
        if (!go) continue;
        try {
          await s.subscriptions.update(sub.id, { billing_cycle_anchor: "now", proration_behavior: "none", payment_behavior: "allow_incomplete" });
        } catch (err) {
          console.error("  new bill failed", err instanceof Error ? err.message : err);
          continue;
        }
        for (const i of open) await s.invoices.voidInvoice(i.id);
        const after = await s.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
        const inv = after.latest_invoice as { id: string; status: string | null; amount_due: number } | null;
        console.log(`  now ${after.status}, ${inv?.id} ${inv?.status} $${(inv?.amount_due ?? 0) / 100}`);
        if (p) await logEvent({ user_id: p.id, kind: "reprice", plan: plan.id, amount_cents: termPrice(plan, term) * 100, meta: { rebilled: inv?.id, voided: open.map((i) => i.id), term: term.id } });
        moved++;
        continue;
      }
      console.log(go ? "MOVE " : "would", line, `$${(item.price.unit_amount ?? 0) / 100} -> $${termPrice(plan, term)}`);
      if (!go) continue;
      await s.subscriptions.update(sub.id, {
        items: [{ id: item.id, price: target }],
        proration_behavior: "none",
        metadata: { ...sub.metadata, plan: plan.id, term: term.id, repriced: new Date().toISOString() },
      });
      if (p) await logEvent({ user_id: p.id, kind: "reprice", plan: plan.id, amount_cents: termPrice(plan, term) * 100, meta: { from: item.price.id, to: target, term: term.id, was: item.price.unit_amount } });
      moved++;
    }
  }
  console.log(go ? `moved ${moved}` : "dry run, --go to move them");
})();
