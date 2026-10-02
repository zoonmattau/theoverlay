// Recent trials booked to cancel: when they started, why they left, and what they looked at in between.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/cancels.ts [days]
import { supabaseAdmin } from "../../src/lib/billing/access";
(async () => {
  const days = Number(process.argv[2] ?? 3);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const db = supabaseAdmin();
  const { data: ps } = await db.from("profiles").select("id, created_at, plan, billing_term, subscription_status, cancel_at, cancel_reason, source, referrer, landing, utm, last_seen_at, discord_id, marketing_opt_in").not("cancel_at", "is", null).gte("created_at", since);
  const t = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", hour: "numeric", minute: "2-digit" });
  for (const p of (ps ?? []) as any[]) {
    console.log(`\n=== ${p.id.slice(0, 8)} plan ${p.plan}/${p.billing_term} ${p.subscription_status}, joined ${t(p.created_at)}, cancel_at ${p.cancel_at?.slice(0, 10)}, reason ${p.cancel_reason}, from ${p.utm?.source ?? p.referrer ?? "-"} ${p.utm?.content ?? ""}, discord ${p.discord_id ? "yes" : "no"}`);
    const { data: ev } = await db.from("events").select("kind, created_at, plan, meta").eq("user_id", p.id).order("created_at");
    for (const e of (ev ?? []) as any[]) {
      const m = e.meta ?? {};
      const what = e.kind === "page_view" ? m.path : e.kind === "subscription" ? `${m.event} ${m.status} cancelAt=${m.cancelAt ? "yes" : "no"} ${m.cancelReason ?? ""}` : JSON.stringify(m).slice(0, 120);
      console.log(`  ${t(e.created_at)}  ${e.kind.padEnd(18)} ${e.plan ?? ""} ${what}`);
    }
  }
})();
