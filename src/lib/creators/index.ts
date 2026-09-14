import "server-only";
import { cookies } from "next/headers";

import { AFF_COOKIE, affiliateByCode, type Affiliate } from "@/lib/affiliates";
import type { Viewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import type { StoredCard } from "@/lib/model/store";
import type { Signal } from "@/lib/model/types";
import { settle } from "@/lib/tips";

/**
 * Tipsters: affiliates with a linked account who post their own calls. Their
 * followers see those calls next to ours, and every call settles the same way
 * ours do, so a tipster's record on the site is the record.
 */

export interface Tipster extends Affiliate {
  user_id: string | null;
  blurb: string | null;
}

export interface CreatorTip {
  id: number;
  affiliate_id: string;
  date: string;
  meeting_id: string;
  race_id: string;
  race_number: number;
  track: string;
  tab_number: number;
  horse_name: string;
  side: Signal;
  price: number;
  comment: string | null;
  bookie: string | null;
  /** Best market price we saw when it was posted. */
  market_at_post: number | null;
  created_at: string;
  finish_position: number | null;
  sp: number | null;
  units: number | null;
  settled_at: string | null;
}

/** The tipster account the signed-in viewer runs, if any. */
export async function tipsterForUser(userId: string | undefined): Promise<Tipster | undefined> {
  if (!userId) return undefined;
  const { data } = await supabaseAdmin().from("affiliates").select("*").eq("user_id", userId).eq("active", true).maybeSingle();
  return (data as Tipster | null) ?? undefined;
}

export async function tipsterById(id: string): Promise<Tipster | undefined> {
  const { data } = await supabaseAdmin().from("affiliates").select("*").eq("id", id).eq("active", true).maybeSingle();
  return (data as Tipster | null) ?? undefined;
}

export async function tipsterByCode(code: string): Promise<Tipster | undefined> {
  const aff = await affiliateByCode(code);
  return aff && (aff as Tipster).user_id ? (aff as Tipster) : undefined;
}

/** Every tipster with a linked account, for the picker in Account. */
export async function allTipsters(): Promise<Tipster[]> {
  const { data } = await supabaseAdmin().from("affiliates").select("*").eq("active", true).not("user_id", "is", null).order("name");
  return (data ?? []) as Tipster[];
}

/**
 * Whose tips this viewer follows. A member's choice lives on their profile
 * (set from the affiliate at sign-up, changed in Account or on a tipster
 * page); a visitor's is the affiliate cookie from the link they arrived on,
 * so a follower sees their tipster before signing up.
 */
export async function followedTipster(viewer: Viewer): Promise<Tipster | undefined> {
  if (viewer.id) {
    const { data } = await supabaseAdmin().from("profiles").select("tipster_id").eq("id", viewer.id).maybeSingle();
    if (!data?.tipster_id) return undefined;
    const t = await tipsterById(data.tipster_id);
    return t?.user_id ? t : undefined;
  }
  const code = (await cookies()).get(AFF_COOKIE)?.value;
  return code ? tipsterByCode(code) : undefined;
}

/** Today's call count for every tipster, for the directory. */
export async function tipsterCallCounts(date: string): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin().from("creator_tips").select("affiliate_id").eq("date", date);
  const out = new Map<string, number>();
  for (const r of (data ?? []) as { affiliate_id: string }[]) out.set(r.affiliate_id, (out.get(r.affiliate_id) ?? 0) + 1);
  return out;
}

/** More than a fifth above the best price we could see when posted. */
export const OVER_MARKET = 0.2;
export const priceFlagged = (t: { price: number; market_at_post: number | null }) => Boolean(t.market_at_post && Number(t.price) > Number(t.market_at_post) * (1 + OVER_MARKET));

export async function creatorTips(affiliateId: string, date: string): Promise<CreatorTip[]> {
  const { data } = await supabaseAdmin().from("creator_tips").select("*").eq("affiliate_id", affiliateId).eq("date", date).order("race_number");
  return (data ?? []) as CreatorTip[];
}

export interface TipsterRecord {
  n: number;
  hit: number;
  units: number;
  /** Last 30 days. */
  month: { n: number; hit: number; units: number };
}

/** A tipster's settled record, all time and the last 30 days. */
export async function tipsterRecord(affiliateId: string): Promise<TipsterRecord> {
  const { data } = await supabaseAdmin().from("creator_tips").select("date, side, units, finish_position").eq("affiliate_id", affiliateId).not("settled_at", "is", null);
  const rows = (data ?? []) as { date: string; side: Signal; units: number; finish_position: number }[];
  const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const tally = (xs: typeof rows) => ({
    n: xs.length,
    hit: xs.filter((r) => (r.side === "back" ? r.finish_position === 1 : r.finish_position !== 1)).length,
    units: Math.round(xs.reduce((a, r) => a + Number(r.units), 0) * 100) / 100,
  });
  return { ...tally(rows), month: tally(rows.filter((r) => r.date >= from)) };
}

/** Settles every tipster's calls for a date from the card's results. Called after each card build. */
export async function settleCreatorTips(date: string, card: StoredCard): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("creator_tips").select("id, race_id, tab_number, side, price").eq("date", date).is("settled_at", null);
  if (error || !data?.length) return;
  const races = new Map(card.meetings.flatMap((m) => m.races.map((r) => [r.raceId, r] as const)));
  for (const t of data as { id: number; race_id: string; tab_number: number; side: Signal; price: number }[]) {
    const r = races.get(t.race_id);
    if (!r?.result?.length) continue;
    const x = r.runners.find((y) => y.tabNumber === t.tab_number);
    if (!x || x.scratched) continue;
    const finish = x.finishPosition ?? 0;
    await db
      .from("creator_tips")
      .update({ finish_position: finish, sp: r.placings?.find((p) => p.tabNumber === t.tab_number)?.sp ?? null, units: settle(t.side, Number(t.price), finish), settled_at: new Date().toISOString() })
      .eq("id", t.id);
  }
}

export interface TipsterMember {
  /** yyyy-mm-dd they signed up through the link. */
  since: string;
  /** Days since sign-up. */
  days: number;
  /** A plan or pass is live now. */
  paying: boolean;
  plan: string | null;
}

/**
 * The people a tipster's link has signed up: when, and whether they are
 * paying now. No names or emails, those are the members' own.
 */
export async function tipsterMembers(affiliateId: string): Promise<{ members: TipsterMember[]; clicks30: number }> {
  const db = supabaseAdmin();
  const month = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data: rows }, { count }] = await Promise.all([
    db.from("profiles").select("affiliate_attributed_at, created_at, access_until, plan").eq("affiliate_id", affiliateId).order("affiliate_attributed_at", { ascending: false }),
    db.from("affiliate_clicks").select("id", { count: "exact", head: true }).eq("affiliate_id", affiliateId).gte("created_at", month),
  ]);
  const now = Date.now();
  const members = ((rows ?? []) as { affiliate_attributed_at: string | null; created_at: string; access_until: string | null; plan: string | null }[]).map((r) => {
    const at = new Date(r.affiliate_attributed_at ?? r.created_at);
    const paying = Boolean(r.access_until && new Date(r.access_until).getTime() > now);
    return { since: at.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }), days: Math.floor((now - at.getTime()) / 86400_000), paying, plan: paying ? r.plan : null };
  });
  return { members, clicks30: count ?? 0 };
}
