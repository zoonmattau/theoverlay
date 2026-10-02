// Every trial in Stripe by billing term: started when, and whether it was booked to cancel or paid.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/trials-by-term.ts
import { stripe } from "../../src/lib/billing/stripe";
(async () => {
  for await (const s of stripe().subscriptions.list({ status: "all", limit: 100 })) {
    if (!s.trial_start) continue;
    const r = s.items.data[0]?.price.recurring;
    const term = r ? `${r.interval_count > 1 ? r.interval_count + " " : ""}${r.interval}` : "?";
    const started = new Date(s.trial_start * 1000).toISOString().slice(0, 10);
    const minsToCancel = s.canceled_at || s.cancel_at ? Math.round((((s.canceled_at ?? 0) || (s as any).cancellation_details ? (s.canceled_at ?? Math.floor(Date.now() / 1000)) : 0) - s.trial_start) / 60) : null;
    const state = s.status === "active" ? "PAID" : s.status === "canceled" ? "ended" : s.cancel_at || s.cancel_at_period_end ? "booked to cancel" : s.status;
    console.log(started, term.padEnd(8), s.metadata?.plan?.padEnd(9), state.padEnd(17), s.cancellation_details?.feedback ?? s.cancellation_details?.reason ?? "");
  }
})();
