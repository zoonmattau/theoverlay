import "server-only";

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

export interface AffiliateStats extends Affiliate {
  clicks: number;
  clicks30: number;
  signups: number;
  paying: number;
  revenue_cents: number;
  commission_cents: number;
}

/** Every affiliate with clicks, sign-ups, paying members and money attributed. */
export async function affiliateStats(): Promise<AffiliateStats[]> {
  const db = supabaseAdmin();
  const month = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data: affs }, { data: clicks }, { data: members }] = await Promise.all([
    db.from("affiliates").select("*").order("created_at", { ascending: false }),
    db.from("affiliate_clicks").select("affiliate_id, created_at"),
    db.from("profiles").select("affiliate_id, total_spent_cents, access_until").not("affiliate_id", "is", null),
  ]);
  const now = Date.now();
  return ((affs ?? []) as Affiliate[]).map((a) => {
    const mine = (clicks ?? []).filter((c) => c.affiliate_id === a.id);
    const people = (members ?? []).filter((m) => m.affiliate_id === a.id);
    const revenue = people.reduce((s, m) => s + (m.total_spent_cents ?? 0), 0);
    return {
      ...a,
      clicks: mine.length,
      clicks30: mine.filter((c) => c.created_at >= month).length,
      signups: people.length,
      paying: people.filter((m) => m.access_until && new Date(m.access_until).getTime() > now).length,
      revenue_cents: revenue,
      commission_cents: Math.round((revenue * Number(a.commission_pct)) / 100),
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
