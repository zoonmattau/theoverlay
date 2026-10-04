import "server-only";

import { foundUs } from "@/lib/arrival";
import { isAdminEmail } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { metaAds, metaSpend } from "./meta-spend";

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

/**
 * One ad over the window: Meta's spend and clicks, and the accounts made from
 * its link in the window, how many of those started a plan and how many have
 * paid. A cohort, so a trial from this window that pays next week counts here
 * then. An account whose tag matches no ad with spend is listed with $0.
 */
export interface AdRow {
  ad: string;
  campaign: string;
  status: string;
  tag: string;
  spend: number;
  clicks: number;
  accounts: number;
  trials: number;
  paid: number;
}

export interface AdsReport {
  days: AdsDay[];
  byAd: AdRow[];
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
  const [spend, ads, { data: profs }, { data: subs }, { data: pays }] = await Promise.all([
    metaSpend(from, today),
    metaAds(from, today),
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

  // By ad: accounts made in the window from each ad's link, and how far they got.
  const fromStart = new Date(`${from}T00:00:00+10:00`).getTime();
  const started = new Set(((subs ?? []) as { user_id: string }[]).map((s) => s.user_id));
  const cohort = new Map<string, { accounts: number; trials: number; paid: number }>();
  for (const p of (profs ?? []) as { id: string; created_at: string; utm: Record<string, string> | null }[]) {
    if (!fromMeta.has(p.id) || new Date(p.created_at).getTime() < fromStart) continue;
    const tag = `${p.utm?.campaign ?? ""}/${p.utm?.content ?? ""}`.toLowerCase();
    const c = cohort.get(tag) ?? { accounts: 0, trials: 0, paid: 0 };
    c.accounts++;
    if (started.has(p.id)) c.trials++;
    if (firstPay.has(p.id)) c.paid++;
    cohort.set(tag, c);
  }
  const byAd: AdRow[] = [];
  const seen = new Set<string>();
  if (ads && !("error" in ads)) {
    // Two ads can share a tag (a copy of an ad); the sign-ups go on the one that spent more.
    for (const a of [...ads].sort((x, y) => y.spend - x.spend)) {
      const c = !seen.has(a.tag) ? cohort.get(a.tag) : undefined;
      seen.add(a.tag);
      byAd.push({ ad: a.ad, campaign: a.campaign, status: a.status, tag: a.tag, spend: a.spend, clicks: a.clicks, accounts: c?.accounts ?? 0, trials: c?.trials ?? 0, paid: c?.paid ?? 0 });
    }
  }
  for (const [tag, c] of cohort) if (!seen.has(tag)) byAd.push({ ad: tag, campaign: "No spend in window", status: "", tag, spend: 0, clicks: 0, ...c });

  const days = [...by.values()];
  const sum = (k: keyof Omit<AdsDay, "date">) => Math.round(days.reduce((a, d) => a + d[k], 0) * 100) / 100;
  const t = { date: "", spend: sum("spend"), signups: sum("signups"), trials: sum("trials"), paid: sum("paid") };
  const per = (n: number) => (n > 0 && t.spend > 0 ? Math.round((t.spend / n) * 100) / 100 : undefined);
  return { days, byAd, missing, totals: { ...t, perSignup: per(t.signups), perTrial: per(t.trials), perPaid: per(t.paid) } };
}
