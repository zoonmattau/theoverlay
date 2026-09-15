import "server-only";

import { listMembers } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";

/** The cookie that remembers which affiliate sent someone, 90 days. */
export const AFF_COOKIE = "overlay_aff";
export const AFF_DAYS = 90;

export interface Affiliate {
  id: string;
  code: string;
  name: string;
  email: string | null;
  commission_pct: number;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export const cleanCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);

/** The code from whatever someone typed: a bare code or the whole /go/CODE link. */
export const codeFromInput = (value: string) => cleanCode(value.trim().replace(/^.*\/go\//i, "").split(/[?#/]/)[0] ?? "");

export async function affiliateByCode(code: string): Promise<Affiliate | undefined> {
  const clean = cleanCode(code);
  if (!clean) return undefined;
  const { data } = await supabaseAdmin().from("affiliates").select("*").eq("code", clean).eq("active", true).maybeSingle();
  return (data as Affiliate | null) ?? undefined;
}

export async function logClick(affiliateId: string, landing: string, referrer: string | null, userAgent: string | null): Promise<void> {
  const { error } = await supabaseAdmin().from("affiliate_clicks").insert({
    affiliate_id: affiliateId,
    landing: landing.slice(0, 200),
    referrer: referrer?.slice(0, 300) ?? null,
    user_agent: userAgent?.slice(0, 200) ?? null,
  });
  if (error) console.error("[affiliates]", error.message);
}

/** Ties a new account to the affiliate whose cookie it carried, once. */
export async function attributeSignup(userId: string, code: string | undefined): Promise<void> {
  if (!code) return;
  const aff = await affiliateByCode(code);
  if (!aff) return;
  await supabaseAdmin()
    .from("profiles")
    .update({ affiliate_id: aff.id, affiliate_attributed_at: new Date().toISOString(), tipster_id: aff.id })
    .eq("id", userId)
    .is("affiliate_id", null);
}

export interface AffiliateClick {
  created_at: string;
  landing: string | null;
  referrer: string | null;
  /** "phone" or "desktop", from the user agent. */
  device: string;
}

export interface AffiliateMember {
  id: string;
  email: string | null;
  created_at: string;
  /** When they confirmed their email, null if they never did. */
  confirmed_at: string | null;
  /** unconfirmed, free, trial, paying or lapsed. */
  status: string;
  plan: string | null;
  spent_cents: number;
  last_seen_at: string | null;
}

export interface AffiliateDay {
  date: string;
  clicks: number;
  signups: number;
}

export interface AffiliateStats extends Affiliate {
  clicks: number;
  clicksToday: number;
  clicks7: number;
  clicks30: number;
  lastClickAt: string | null;
  signups: number;
  signups30: number;
  /** Sign-ups that confirmed their email. */
  confirmed: number;
  /** Confirmed sign-ups per hundred clicks. */
  conversion: number;
  paying: number;
  revenue_cents: number;
  commission_cents: number;
  /** The last 14 days, newest first. */
  days: AffiliateDay[];
  /** The last 30 clicks, newest first. */
  recentClicks: AffiliateClick[];
  /** Everyone who signed up through the link, newest first. */
  members: AffiliateMember[];
}

const sydneyDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

/** Every affiliate with clicks, sign-ups, paying members and money attributed, and the detail behind each number. */
export async function affiliateStats(): Promise<AffiliateStats[]> {
  const db = supabaseAdmin();
  const now = Date.now();
  const today = sydneyDay(new Date(now).toISOString());
  const week = new Date(now - 7 * 86400_000).toISOString();
  const month = new Date(now - 30 * 86400_000).toISOString();
  const [{ data: affs }, { data: clicks }, everyone] = await Promise.all([
    db.from("affiliates").select("*").order("created_at", { ascending: false }),
    db.from("affiliate_clicks").select("affiliate_id, created_at, landing, referrer, user_agent").order("created_at", { ascending: false }),
    listMembers(),
  ]);
  const members = everyone.filter((m) => m.affiliate_id);
  const window: string[] = [];
  for (let i = 0; i < 14; i++) window.push(sydneyDay(new Date(now - i * 86400_000).toISOString()));
  type Click = { affiliate_id: string; created_at: string; landing: string | null; referrer: string | null; user_agent: string | null };
  type Member = (typeof members)[number];
  return ((affs ?? []) as Affiliate[]).map((a) => {
    const mine = ((clicks ?? []) as Click[]).filter((c) => c.affiliate_id === a.id);
    const people = members.filter((m) => m.affiliate_id === a.id);
    const revenue = people.reduce((s, m) => s + (m.total_spent_cents ?? 0), 0);
    const live = (m: Member) => Boolean(m.access_until && new Date(m.access_until).getTime() > now);
    const status = (m: Member) => (!m.confirmed_at ? "unconfirmed" : live(m) ? (m.subscription_status === "trialing" ? "trial" : "paying") : m.total_spent_cents ? "lapsed" : "free");
    const confirmed = people.filter((m) => m.confirmed_at);
    const clickDays = new Map<string, number>();
    const signupDays = new Map<string, number>();
    for (const c of mine) clickDays.set(sydneyDay(c.created_at), (clickDays.get(sydneyDay(c.created_at)) ?? 0) + 1);
    for (const m of people) signupDays.set(sydneyDay(m.created_at), (signupDays.get(sydneyDay(m.created_at)) ?? 0) + 1);
    return {
      ...a,
      clicks: mine.length,
      clicksToday: clickDays.get(today) ?? 0,
      clicks7: mine.filter((c) => c.created_at >= week).length,
      clicks30: mine.filter((c) => c.created_at >= month).length,
      lastClickAt: mine[0]?.created_at ?? null,
      signups: people.length,
      signups30: people.filter((m) => m.created_at >= month).length,
      confirmed: confirmed.length,
      conversion: mine.length ? Math.round((confirmed.length / mine.length) * 1000) / 10 : 0,
      paying: people.filter(live).length,
      revenue_cents: revenue,
      commission_cents: Math.round((revenue * Number(a.commission_pct)) / 100),
      days: window.map((date) => ({ date, clicks: clickDays.get(date) ?? 0, signups: signupDays.get(date) ?? 0 })),
      recentClicks: mine.slice(0, 30).map((c) => ({
        created_at: c.created_at,
        landing: c.landing,
        referrer: c.referrer,
        device: /mobile|iphone|android/i.test(c.user_agent ?? "") ? "phone" : "desktop",
      })),
      members: people.map((m) => ({
        id: m.id,
        email: m.email,
        created_at: m.created_at,
        confirmed_at: m.confirmed_at ?? null,
        status: status(m),
        plan: m.plan,
        spent_cents: m.total_spent_cents ?? 0,
        last_seen_at: m.last_seen_at,
      })),
    };
  });
}

export interface MonthlyCommission {
  month: string;
  affiliate: Affiliate;
  /** Payments from this affiliate's members in the month. */
  payments: number;
  revenue_cents: number;
  commission_cents: number;
  paid_cents: number | null;
  paid_at: string | null;
  note: string | null;
}

const sydneyMonth = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }).slice(0, 7);

/** Commission owed to each affiliate by month, from payment events, with what has been paid. */
export async function commissionByMonth(): Promise<MonthlyCommission[]> {
  const db = supabaseAdmin();
  const [{ data: affs }, { data: members }, { data: payments }, { data: payouts }] = await Promise.all([
    db.from("affiliates").select("*"),
    db.from("profiles").select("id, affiliate_id").not("affiliate_id", "is", null),
    db.from("events").select("user_id, amount_cents, created_at").eq("kind", "payment"),
    db.from("affiliate_payouts").select("affiliate_id, month, amount_cents, paid_at, note"),
  ]);
  const affOf = new Map((members ?? []).map((m) => [m.id as string, m.affiliate_id as string]));
  const byKey = new Map<string, { payments: number; cents: number }>();
  for (const p of (payments ?? []) as { user_id: string | null; amount_cents: number | null; created_at: string }[]) {
    const aff = p.user_id ? affOf.get(p.user_id) : undefined;
    if (!aff || !p.amount_cents) continue;
    const key = `${aff}:${sydneyMonth(p.created_at)}`;
    const cur = byKey.get(key) ?? { payments: 0, cents: 0 };
    byKey.set(key, { payments: cur.payments + 1, cents: cur.cents + p.amount_cents });
  }
  const paid = new Map((payouts ?? []).map((p) => [`${p.affiliate_id}:${p.month}`, p as { amount_cents: number; paid_at: string; note: string | null }]));
  const out: MonthlyCommission[] = [];
  for (const a of (affs ?? []) as Affiliate[]) {
    const months = new Set<string>();
    for (const key of byKey.keys()) if (key.startsWith(`${a.id}:`)) months.add(key.slice(a.id.length + 1));
    for (const key of paid.keys()) if (key.startsWith(`${a.id}:`)) months.add(key.slice(a.id.length + 1));
    for (const month of months) {
      const v = byKey.get(`${a.id}:${month}`) ?? { payments: 0, cents: 0 };
      const p = paid.get(`${a.id}:${month}`);
      out.push({
        month, affiliate: a, payments: v.payments, revenue_cents: v.cents,
        commission_cents: Math.round((v.cents * Number(a.commission_pct)) / 100),
        paid_cents: p?.amount_cents ?? null, paid_at: p?.paid_at ?? null, note: p?.note ?? null,
      });
    }
  }
  return out.sort((x, y) => y.month.localeCompare(x.month) || x.affiliate.name.localeCompare(y.affiliate.name));
}
