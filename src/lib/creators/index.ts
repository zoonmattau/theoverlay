import "server-only";
import { cookies } from "next/headers";

import { AFF_COOKIE, FOLLOW_COOKIE, affiliateByCode, type Affiliate } from "@/lib/affiliates";
import type { Viewer } from "@/lib/auth";
import { listMembers } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/billing/access";
import { planById } from "@/lib/billing/plans";
import type { StoredCard } from "@/lib/model/store";
import type { Signal } from "@/lib/model/types";
import { settle, voidSettlement } from "@/lib/tips";

/**
 * Tipsters: affiliates with a linked account who post their own calls. Their
 * followers see those calls next to ours, and every call settles the same way
 * ours do, so a tipster's record on the site is the record.
 */

export interface Tipster extends Affiliate {
  user_id: string | null;
  blurb: string | null;
  instagram?: string | null;
  twitter?: string | null;
  tiktok?: string | null;
  /** A letter or two the tipster picked for their avatar. */
  avatar_letter?: string | null;
  /** Their uploaded round logo, in the avatars bucket. */
  avatar_url?: string | null;
}

/**
 * A tipster's call is for people with access that day: before its race is settled it shows only to
 * a member, a pass holder or a tipster (hasAccess); once settled it is on the record for everyone (12 Oct 2026).
 */
export const tipVisible = (open: boolean) => (t: { settled_at?: string | null }) => open || Boolean(t.settled_at);

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
  /** What the bookie named has it at. */
  bookie_price: number | null;
  /** Best market price we saw when it was posted. */
  market_at_post: number | null;
  /** Units on the call, one unless the tipster said otherwise. */
  stake: number;
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

/** A tipster as members see them: unlisted ones come back only when asked for. */
export async function tipsterById(id: string, opts: { unlisted?: boolean } = {}): Promise<Tipster | undefined> {
  const { data } = await supabaseAdmin().from("affiliates").select("*").eq("id", id).eq("active", true).maybeSingle();
  const t = (data as Tipster | null) ?? undefined;
  return t && (t.listed || opts.unlisted) ? t : undefined;
}

export async function tipsterByCode(code: string, opts: { unlisted?: boolean } = {}): Promise<Tipster | undefined> {
  const aff = await affiliateByCode(code);
  const t = aff && (aff as Tipster).user_id ? (aff as Tipster) : undefined;
  return t && (t.listed || opts.unlisted) ? t : undefined;
}

/** Every tipster with a linked account, for the directory and the picker in Account; admin asks for the unlisted too. */
export async function allTipsters(opts: { unlisted?: boolean } = {}): Promise<Tipster[]> {
  let q = supabaseAdmin().from("affiliates").select("*").eq("active", true).not("user_id", "is", null);
  if (!opts.unlisted) q = q.eq("listed", true);
  const { data } = await q.order("name");
  return (data ?? []) as Tipster[];
}

/**
 * Whose tips this viewer follows, any number of them. A member's follows
 * live in the follows table (the affiliate at sign-up is the first, more
 * come from Account or a tipster page); a visitor's is the affiliate cookie
 * from the link they arrived on, so a follower sees their tipster before
 * signing up.
 */
export async function followedTipsters(viewer: Viewer): Promise<Tipster[]> {
  if (viewer.id) {
    const { data } = await supabaseAdmin().from("follows").select("tipster_id").eq("user_id", viewer.id).order("created_at");
    const ids = (data ?? []).map((r) => r.tipster_id as string);
    if (ids.length === 0) return [];
    // A follow of an unlisted tipster keeps, and shows again the day they are listed.
    const { data: rows } = await supabaseAdmin().from("affiliates").select("*").in("id", ids).eq("active", true).eq("listed", true).not("user_id", "is", null);
    const byId = new Map(((rows ?? []) as Tipster[]).map((t) => [t.id, t]));
    return ids.map((id) => byId.get(id)).filter((t): t is Tipster => Boolean(t));
  }
  // A visitor follows the tipster they chose, or the one whose link they came in on.
  const jar = await cookies();
  const code = jar.get(FOLLOW_COOKIE)?.value ?? jar.get(AFF_COOKIE)?.value;
  const t = code ? await tipsterByCode(code) : undefined;
  return t ? [t] : [];
}

/** The tipsters this viewer follows, each with their calls for the date. */
export async function followedCalls(viewer: Viewer, date: string): Promise<{ tipster: Tipster; tips: CreatorTip[] }[]> {
  const tipsters = await followedTipsters(viewer);
  return Promise.all(tipsters.map(async (tipster) => ({ tipster, tips: await creatorTips(tipster.id, date) })));
}

/**
 * Every listed tipster with a call on the day and the races they called, the
 * viewer's follows first, for the logos on the board. Anyone sees who has a
 * call in a race, signed in or not (14 Oct 2026); the horse stays behind
 * tipVisible.
 */
export async function boardTipsters(viewer: Viewer, date: string): Promise<{ tipster: Tipster; raceIds: string[] }[]> {
  const followed = await followedCalls(viewer, date);
  const ids = new Set(followed.map((f) => f.tipster.id));
  const others = await callsOn(date, (await allTipsters()).filter((t) => !ids.has(t.id)));
  const out = new Map<string, { tipster: Tipster; raceIds: string[] }>();
  for (const f of followed) if (f.tips.length > 0) out.set(f.tipster.id, { tipster: f.tipster, raceIds: f.tips.map((t) => t.race_id) });
  for (const t of others) {
    const row = out.get(t.affiliate_id) ?? { tipster: t.tipster, raceIds: [] };
    row.raceIds.push(t.race_id);
    out.set(t.affiliate_id, row);
  }
  return [...out.values()];
}

/** Everyone who follows a tipster, for their emails. */
export async function followerIds(tipsterId: string): Promise<string[]> {
  const { data } = await supabaseAdmin().from("follows").select("user_id").eq("tipster_id", tipsterId);
  return (data ?? []).map((r) => r.user_id as string);
}

/** Who follows a tipster, newest first, for the admin's list on the tipster page. */
export async function followersOf(tipsterId: string): Promise<{ id: string; name: string; email: string | null; since: string }[]> {
  const db = supabaseAdmin();
  const { data: f } = await db.from("follows").select("user_id, created_at").eq("tipster_id", tipsterId).order("created_at", { ascending: false });
  const rows = (f ?? []) as { user_id: string; created_at: string }[];
  if (!rows.length) return [];
  const { data: p } = await db.from("profiles").select("id, full_name, email").in("id", rows.map((r) => r.user_id));
  const who = new Map(((p ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((x) => [x.id, x]));
  return rows.map((r) => ({ id: r.user_id, name: who.get(r.user_id)?.full_name || who.get(r.user_id)?.email?.split("@")[0] || "Member", email: who.get(r.user_id)?.email ?? null, since: r.created_at }));
}

/** Today's call count for every tipster, for the directory. */
export async function tipsterCallCounts(date: string): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin().from("creator_tips").select("affiliate_id").eq("date", date);
  const out = new Map<string, number>();
  for (const r of (data ?? []) as { affiliate_id: string }[]) out.set(r.affiliate_id, (out.get(r.affiliate_id) ?? 0) + 1);
  return out;
}

/** The price a call is struck at, and settles at: the bookmaker price the tipster took where they gave one, else the price they quoted. */
export const struckAt = (t: { price: number; bookie_price?: number | null }) => (t.bookie_price && Number(t.bookie_price) > 1 ? Number(t.bookie_price) : Number(t.price));

/** Units a tipster can put on a call: a quarter to ten, a whole unit unless they say. */
export const STAKE_MIN = 0.25;
export const STAKE_MAX = 10;
export const parseStake = (v: unknown): number => {
  const n = Math.round(Number(v) * 100) / 100;
  return Number.isFinite(n) && n > 0 ? Math.min(STAKE_MAX, Math.max(STAKE_MIN, n)) : 1;
};
/** "2u" beside a call; nothing for the usual one unit. */
export const stakeLabel = (t: { stake?: number | null }): string => {
  const n = Number(t.stake ?? 1);
  return n === 1 ? "" : `${n % 1 ? n.toFixed(2).replace(/0$/, "") : n}u`;
};

/** More than a fifth above the best price we could see when posted. */
export const OVER_MARKET = 0.2;
/** The site owner's own tipster account (Matt): his calls never carry the over-market flag. */
const NEVER_FLAGGED = new Set(["dbca2780-fbd6-4df0-8411-8d42a5e26c2f"]);
/** A back call posted at a price well over the best market we saw. Never a lay (a bigger lay price is no favour to anyone), never Matt's. */
export const priceFlagged = (t: { price: number; market_at_post: number | null; side?: string; affiliate_id?: string }) =>
  t.side !== "lay" && !NEVER_FLAGGED.has(t.affiliate_id ?? "") && Boolean(t.market_at_post && Number(t.price) > Number(t.market_at_post) * (1 + OVER_MARKET));

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
  const { data } = await supabaseAdmin().from("creator_tips").select("date, side, units, finish_position").eq("affiliate_id", affiliateId).not("settled_at", "is", null).not("finish_position", "is", null);
  const rows = (data ?? []) as { date: string; side: Signal; units: number; finish_position: number }[];
  const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const tally = (xs: typeof rows) => ({
    n: xs.length,
    hit: xs.filter((r) => (r.side === "back" ? r.finish_position === 1 : r.finish_position !== 1)).length,
    units: Math.round(xs.reduce((a, r) => a + Number(r.units), 0) * 100) / 100,
  });
  return { ...tally(rows), month: tally(rows.filter((r) => r.date >= from)) };
}

export interface SideRecord {
  n: number;
  hit: number;
  units: number;
  /** Units per unit staked. */
  roi: number;
}

/** The windows the leaderboard can rank on. */
export const TIPSTER_PERIODS = [
  { id: "7", label: "7 days", days: 7 },
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "all", label: "All time" },
] as const;
export type TipsterPeriod = (typeof TIPSTER_PERIODS)[number]["id"];
export const tipsterPeriod = (v: unknown): TipsterPeriod => (TIPSTER_PERIODS.some((p) => p.id === v) ? (v as TipsterPeriod) : "all");

/**
 * A tipster as the marketplace sizes them up: the record all time and over
 * each window, bets and lays apart, the run of recent results, how often
 * they post, and how many follow them.
 */
export interface TipsterProfile {
  tipster: Tipster;
  all: SideRecord;
  month: SideRecord;
  /** The record over each window the leaderboard offers. */
  windows: Record<TipsterPeriod, SideRecord>;
  bets: SideRecord;
  lays: SideRecord;
  /** Average price struck on bets. */
  avgPrice?: number;
  /** Settled calls, newest first, up to ten. */
  recent: { won: boolean; units: number; horse: string; date: string; side: Signal }[];
  /** First day they posted, yyyy-mm-dd. */
  since?: string;
  /** Calls posted, settled or not. */
  posted: number;
  /** Calls a week over the last 30 days. */
  perWeek: number;
  /** Share of calls that came with a reason, 0-1. */
  reasoned: number;
  followers: number;
  /** Their biggest winning bet. */
  best?: { horse: string; price: number; date: string; track: string };
}

const tallySide = (xs: { side: Signal; units: number | null; finish_position: number | null; stake?: number | null }[]): SideRecord => {
  const n = xs.length;
  const hit = xs.filter((r) => (r.side === "back" ? r.finish_position === 1 : r.finish_position !== 1)).length;
  const units = Math.round(xs.reduce((a, r) => a + Number(r.units), 0) * 100) / 100;
  const staked = xs.reduce((a, r) => a + Number(r.stake ?? 1), 0);
  return { n, hit, units, roi: staked ? units / staked : 0 };
};

/** Profiles for a set of tipsters in two queries, for the directory. */
export async function tipsterProfiles(tipsters: Tipster[]): Promise<TipsterProfile[]> {
  if (tipsters.length === 0) return [];
  const ids = tipsters.map((t) => t.id);
  const db = supabaseAdmin();
  const [{ data: tips }, { data: follows }] = await Promise.all([
    db.from("creator_tips").select("affiliate_id, date, track, horse_name, side, price, bookie_price, stake, comment, units, finish_position, settled_at").in("affiliate_id", ids).order("date", { ascending: false }).order("created_at", { ascending: false }),
    db.from("follows").select("tipster_id").in("tipster_id", ids),
  ]);
  const followers = new Map<string, number>();
  for (const f of (follows ?? []) as { tipster_id: string }[]) followers.set(f.tipster_id, (followers.get(f.tipster_id) ?? 0) + 1);
  const rows = (tips ?? []) as (Pick<CreatorTip, "affiliate_id" | "date" | "track" | "horse_name" | "side" | "price" | "bookie_price" | "stake" | "comment" | "units" | "finish_position" | "settled_at">)[];
  const from = (days: number) => new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const month = from(30);
  return tipsters.map((tipster) => {
    const mine = rows.filter((r) => r.affiliate_id === tipster.id);
    // A void (scratched after the call) has no finishing position and counts for nothing.
    const settled = mine.filter((r) => r.settled_at && r.finish_position !== null);
    const bets = settled.filter((r) => r.side === "back");
    const wins = bets.filter((r) => r.finish_position === 1);
    const best = wins.sort((a, b) => struckAt(b) - struckAt(a))[0];
    const inMonth = mine.filter((r) => r.date >= month).length;
    return {
      tipster,
      all: tallySide(settled),
      month: tallySide(settled.filter((r) => r.date >= month)),
      windows: Object.fromEntries(TIPSTER_PERIODS.map((w) => [w.id, tallySide("days" in w ? settled.filter((r) => r.date >= from(w.days)) : settled)])) as Record<TipsterPeriod, SideRecord>,
      bets: tallySide(bets),
      lays: tallySide(settled.filter((r) => r.side === "lay")),
      avgPrice: bets.length ? Math.round((bets.reduce((a, r) => a + struckAt(r), 0) / bets.length) * 100) / 100 : undefined,
      recent: settled.slice(0, 10).map((r) => ({ won: (r.side === "back" ? r.finish_position === 1 : r.finish_position !== 1), units: Number(r.units), horse: r.horse_name, date: r.date, side: r.side })),
      since: mine.length ? mine[mine.length - 1].date : undefined,
      posted: mine.length,
      perWeek: Math.round((inMonth / 30) * 7 * 10) / 10,
      reasoned: mine.length ? mine.filter((r) => r.comment?.trim()).length / mine.length : 0,
      followers: followers.get(tipster.id) ?? 0,
      best: best ? { horse: best.horse_name, price: struckAt(best), date: best.date, track: best.track } : undefined,
    };
  });
}

/**
 * The directory's order: the best over the window first, then the best all
 * time among those with nothing settled in it, then whoever has posted
 * most among the unsettled.
 */
export function rankProfiles(profiles: TipsterProfile[], period: TipsterPeriod = "30"): TipsterProfile[] {
  return [...profiles].sort((a, b) => {
    const x = a.windows[period], y = b.windows[period];
    if (x.n && y.n) return y.units - x.units || y.roi - x.roi;
    if (x.n !== y.n && (!x.n || !y.n)) return x.n ? -1 : 1;
    if (a.all.n && b.all.n) return b.all.units - a.all.units;
    if (a.all.n !== b.all.n && (!a.all.n || !b.all.n)) return a.all.n ? -1 : 1;
    return b.posted - a.posted || a.tipster.name.localeCompare(b.tipster.name);
  });
}

/** A call with the tipster who made it, for feeds across every tipster. */
export type FeedTip = CreatorTip & { tipster: Tipster };

/** Every listed tipster's calls for a date, in race order, for the marketplace feed. */
export async function callsOn(date: string, tipsters: Tipster[]): Promise<FeedTip[]> {
  if (tipsters.length === 0) return [];
  const byId = new Map(tipsters.map((t) => [t.id, t]));
  const { data } = await supabaseAdmin().from("creator_tips").select("*").eq("date", date).in("affiliate_id", [...byId.keys()]).order("race_number");
  return ((data ?? []) as CreatorTip[]).map((t) => ({ ...t, tipster: byId.get(t.affiliate_id)! }));
}

/** The latest settled calls across the listed tipsters, newest first. */
export async function latestResults(tipsters: Tipster[], limit = 20): Promise<FeedTip[]> {
  if (tipsters.length === 0) return [];
  const byId = new Map(tipsters.map((t) => [t.id, t]));
  const { data } = await supabaseAdmin().from("creator_tips").select("*").in("affiliate_id", [...byId.keys()]).not("settled_at", "is", null).order("settled_at", { ascending: false }).limit(limit);
  return ((data ?? []) as CreatorTip[]).map((t) => ({ ...t, tipster: byId.get(t.affiliate_id)! }));
}

/** Each tipster's last few calls before a date, newest first, keyed by tipster id, for the cards' dropdowns. */
export async function recentCalls(tipsters: Tipster[], before: string, each = 5): Promise<Map<string, CreatorTip[]>> {
  const out = new Map<string, CreatorTip[]>();
  if (tipsters.length === 0) return out;
  const { data } = await supabaseAdmin().from("creator_tips").select("*").in("affiliate_id", tipsters.map((t) => t.id)).lt("date", before).order("date", { ascending: false }).order("race_number", { ascending: false }).limit(each * tipsters.length * 4);
  for (const t of (data ?? []) as CreatorTip[]) {
    const list = out.get(t.affiliate_id) ?? [];
    if (list.length < each) out.set(t.affiliate_id, [...list, t]);
  }
  return out;
}

/** A tipster's calls before today, newest first, settled or still to run. */
export async function tipsterHistory(affiliateId: string, before: string, limit = 100): Promise<CreatorTip[]> {
  const { data } = await supabaseAdmin().from("creator_tips").select("*").eq("affiliate_id", affiliateId).lt("date", before).order("date", { ascending: false }).order("race_number", { ascending: false }).limit(limit);
  return (data ?? []) as CreatorTip[];
}

/** Settles every tipster's calls for a date from the card's results. Called after each card build. */
export async function settleCreatorTips(date: string, card: StoredCard): Promise<void> {
  const db = supabaseAdmin();
  // Open calls settle; a settled call whose placing the official result has
  // since moved (an interim result, then a protest upheld) settles again.
  const { data, error } = await db.from("creator_tips").select("id, race_id, tab_number, side, price, bookie_price, stake, settled_at, finish_position").eq("date", date);
  if (error || !data?.length) return;
  const races = new Map(card.meetings.flatMap((m) => m.races.map((r) => [r.raceId, r] as const)));
  for (const t of data as { id: number; race_id: string; tab_number: number; side: Signal; price: number; bookie_price: number | null; stake: number; settled_at: string | null; finish_position: number | null }[]) {
    const r = races.get(t.race_id);
    const x = r?.runners.find((y) => y.tabNumber === t.tab_number);
    // Scratched after the call: a void, settled once and left out of every count.
    if (x?.scratched) {
      if (!t.settled_at || t.finish_position !== null) await db.from("creator_tips").update(voidSettlement()).eq("id", t.id);
      continue;
    }
    if (!r?.result?.length || !x) continue;
    const finish = x.finishPosition ?? 0;
    if (t.settled_at && t.finish_position === finish) continue;
    await db
      .from("creator_tips")
      .update({ finish_position: finish, sp: r.placings?.find((p) => p.tabNumber === t.tab_number)?.sp ?? null, units: settle(t.side, struckAt(t), finish, Number(t.stake ?? 1)), settled_at: t.settled_at ?? new Date().toISOString() })
      .eq("id", t.id);
  }
}

/** Where someone from a tipster's link stands, in the order the list explains them. */
export type TipsterMemberStatus = "unconfirmed" | "no_plan" | "trial" | "paying" | "cancelling" | "failed" | "pass" | "left";

export interface TipsterMember {
  /** Their name and email; the tipster who brought them in sees both (the user, 12 Oct 2026). */
  name: string | null;
  email: string | null;
  /** yyyy-mm-dd they signed up through the link. */
  since: string;
  /** Days since sign-up. */
  days: number;
  status: TipsterMemberStatus;
  /** "Every day, monthly" while on a plan, or the plan they left. */
  plan: string | null;
  /** The date that goes with the status: the trial's end, the cancel date, when access ended. */
  until: string | null;
  /** On a plan or a pass now, so it counts as paying. */
  paying: boolean;
}

/**
 * The people a tipster's link has signed up: who, when, what they are on and
 * where they stand (the user, 12 Oct 2026: names, emails and plans; the
 * privacy policy says so), and what we have paid the tipster in all.
 */
export async function tipsterMembers(affiliateId: string): Promise<{ members: TipsterMember[]; clicks30: number; paidCents: number }> {
  const db = supabaseAdmin();
  const month = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [everyone, { count }, { data: payouts }] = await Promise.all([
    listMembers(),
    db.from("affiliate_clicks").select("id", { count: "exact", head: true }).eq("affiliate_id", affiliateId).gte("created_at", month),
    db.from("affiliate_payouts").select("amount_cents").eq("affiliate_id", affiliateId),
  ]);
  const now = Date.now();
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const TERM: Record<string, string> = { week: "weekly", month: "monthly", quarter: "quarterly", year: "yearly" };
  const members = everyone
    .filter((m) => m.affiliate_id === affiliateId)
    .map((m): TipsterMember & { at: number } => {
      const at = new Date(m.affiliate_attributed_at ?? m.created_at).getTime();
      const live = Boolean(m.access_until && new Date(m.access_until).getTime() > now);
      const planName = m.plan ? (planById(m.plan)?.name ?? null) : null;
      const plan = planName ? `${planName}${m.billing_term && TERM[m.billing_term] ? `, ${TERM[m.billing_term]}` : ""}` : null;
      const sub = m.subscription_status;
      let status: TipsterMemberStatus;
      let until: string | null = null;
      if (!m.confirmed_at && !m.invited_at) status = "unconfirmed";
      else if (live && sub === "past_due") status = "failed";
      else if (live && m.cancel_at) [status, until] = ["cancelling", day(m.cancel_at)];
      else if (live && sub === "trialing") [status, until] = ["trial", day(m.access_until!)];
      else if (live && planName) status = "paying";
      else if ((m.pass_credits ?? 0) > 0 || (!planName && (m.total_spent_cents ?? 0) > 0)) status = "pass";
      else if (m.plan || m.access_until) [status, until] = ["left", m.access_until && new Date(m.access_until).getTime() > 86400_000 ? day(m.access_until) : null];
      else status = "no_plan";
      return { at, name: m.full_name?.trim() || null, email: m.email ?? null, since: day(new Date(at).toISOString()), days: Math.floor((now - at) / 86400_000), status, plan: status === "no_plan" || status === "unconfirmed" || status === "pass" ? null : plan, until, paying: ["trial", "paying", "cancelling", "failed", "pass"].includes(status) };
    })
    .sort((a, b) => b.at - a.at)
    .map((m) => ({ name: m.name, email: m.email, since: m.since, days: m.days, status: m.status, plan: m.plan, until: m.until, paying: m.paying }));
  return { members, clicks30: count ?? 0, paidCents: ((payouts ?? []) as { amount_cents: number }[]).reduce((s, p) => s + p.amount_cents, 0) };
}
