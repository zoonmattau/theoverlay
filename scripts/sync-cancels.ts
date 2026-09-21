// Reads every subscription we hold from Stripe and writes its booked
// cancellation, if any, onto the profile: cancel_at and the reason the
// portal collected. Run once after the 21 Sep 2026 migration, and any time
// the webhook may have missed an update.
// npx tsx --tsconfig tsconfig.json scripts/sync-cancels.ts
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" };

interface Profile { id: string; email: string; full_name: string | null; stripe_subscription_id: string }

async function main() {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?stripe_subscription_id=not.is.null&select=id,email,full_name,stripe_subscription_id`, { headers });
  const profiles: Profile[] = await res.json();
  for (const p of profiles) {
    const sub = await (await fetch(`https://api.stripe.com/v1/subscriptions/${p.stripe_subscription_id}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } })).json();
    if (sub.error) {
      console.log(`${p.email}: ${sub.error.message}`);
      continue;
    }
    const periodEnd = sub.items?.data?.[0]?.current_period_end;
    const cancelAt = sub.status === "canceled" ? null : sub.cancel_at ? new Date(sub.cancel_at * 1000) : sub.cancel_at_period_end && periodEnd ? new Date(periodEnd * 1000) : null;
    const reason = cancelAt ? sub.cancellation_details?.feedback ?? sub.cancellation_details?.reason ?? null : null;
    const write = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${p.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ subscription_status: sub.status, cancel_at: cancelAt?.toISOString() ?? null, cancel_reason: reason }),
    });
    const note = write.ok ? "" : ` WRITE FAILED ${write.status} ${(await write.text()).slice(0, 120)}`;
    console.log(`${(p.full_name ?? p.email).padEnd(16)} ${sub.status}${cancelAt ? `, cancels ${cancelAt.toISOString().slice(0, 10)} (${reason})` : ""}${note}`);
  }
}

main();
