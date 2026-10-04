import "server-only";

import { foundUs } from "@/lib/arrival";
import { isAdminEmail } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { metaSpend } from "./meta-spend";

/**
 * Meta's spend against what it brought, by Sydney day: accounts made from a
 * Meta ad (our own utm tags, not Meta's pixel, which counts about half), the
 * trials those accounts started and their first payments. Each lands on the
 * day it happened, so a trial started today from last week's click counts
 * today. Paying lags a trial by its length, so the window totals read the
 * cost per paying member better than any single day.
 */
export interface AdsDay {
  date: string;
  spend: number;
  signups: number;
  trials: number;
  paid: number;
}

export interface AdsReport {
  days: AdsDay[];
  /** Why there is no spend: no token yet, or Meta's error. */
  missing?: string;
  totals: AdsDay & { perSignup?: number; perTrial?: number; perPaid?: number };
}

const DAY = 86400_000;
const sydneyDay = (iso: string | number) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

export async function adsReport(windowDays: number): Promise<AdsReport> {
  const today = sydneyDay(Date.now());
  const dates = Array.from({ length: windowDays }, (_, i) => sydneyDay(new Date(`${today}T12:00:00Z`).getTime() - (windowDays - 1 - i) * DAY));
  const from = dates[0];
  const db = supabaseAdmin();
  const [spend, { data: profs }, { data: subs }, { data: pays }] = await Promise.all([
    metaSpend(from, today),
    db.from("profiles").select("id, email, is_admin, created_at, source, landing, referrer, utm"),
    db.from("events").select("user_id, created_at, meta").eq("kind", "subscription").eq("meta->>event", "customer.subscription.created"),
    db.from("events").select("user_id, created_at").eq("kind", "payment").order("created_at"),
  ]);
  const fromMeta = new Set(
    ((profs ?? []) as { id: string; email: string | null; is_admin: boolean | null; utm: Record<string, string> | null; source: string | null; landing: string | null; referrer: string | null }[])
      .filter((p) => !p.is_admin && !isAdminEmail(p.email) && foundUs(p).group === "Meta ads")
      .map((p) => p.id),
  );
  const created = new Map(((profs ?? []) as { id: string; created_at: string }[]).map((p) => [p.id, p.created_at]));
  const blank = (date: string): AdsDay => ({ date, spend: 0, signups: 0, trials: 0, paid: 0 });
  const by = new Map(dates.map((d) => [d, blank(d)]));
  const bump = (iso: string, key: "signups" | "trials" | "paid") => {
    const d = by.get(sydneyDay(iso));
    if (d) d[key]++;
  };
  for (const id of fromMeta) bump(created.get(id)!, "signups");
  for (const s of (subs ?? []) as { user_id: string; created_at: string; meta: { status?: string } | null }[]) {
    if (fromMeta.has(s.user_id) && s.meta?.status === "trialing") bump(s.created_at, "trials");
  }
  // A paying member is counted once, on their first payment: renewals are not new members.
  const firstPay = new Map<string, string>();
  for (const p of (pays ?? []) as { user_id: string; created_at: string }[]) if (!firstPay.has(p.user_id)) firstPay.set(p.user_id, p.created_at);
  for (const [userId, at] of firstPay) if (fromMeta.has(userId)) bump(at, "paid");

  let missing: string | undefined;
  if (spend === undefined) missing = "Meta is not connected yet: set META_ADS_TOKEN and META_AD_ACCOUNT.";
  else if ("error" in spend) missing = `Meta did not answer: ${spend.error}`;
  else for (const s of spend) { const d = by.get(s.date); if (d) d.spend = s.spend; }

  const days = [...by.values()];
  const sum = (k: keyof Omit<AdsDay, "date">) => Math.round(days.reduce((a, d) => a + d[k], 0) * 100) / 100;
  const t = { date: "", spend: sum("spend"), signups: sum("signups"), trials: sum("trials"), paid: sum("paid") };
  const per = (n: number) => (n > 0 && t.spend > 0 ? Math.round((t.spend / n) * 100) / 100 : undefined);
  return { days, missing, totals: { ...t, perSignup: per(t.signups), perTrial: per(t.trials), perPaid: per(t.paid) } };
}
