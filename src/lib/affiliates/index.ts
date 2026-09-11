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
    .update({ affiliate_id: aff.id, affiliate_attributed_at: new Date().toISOString() })
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
