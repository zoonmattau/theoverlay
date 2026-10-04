import "server-only";

import { isAdminEmail } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { planCovers } from "@/lib/billing/plans";

/**
 * How many people had the board on each racing date, rebuilt from what is
 * logged: the subscription events (status, plan and access end at each change),
 * day passes, and gifted time (admin days, invites, Instagram-follow days).
 * A plan counts only on the days it covers, so a Saturday member counts on
 * Saturdays. Each person counts once a day, in the first group that fits:
 * paying, trial, day pass, gift. A day counts access from 10am Sydney, so
 * access that ran out overnight does not. Admins, tipsters and our own
 * addresses are left out. Subscriptions are logged from 15 Sep 2026.
 */
export const ACCESS_GROUPS = ["paying", "trial", "pass", "gift"] as const;
export type AccessGroup = (typeof ACCESS_GROUPS)[number];

export interface AccessDay {
  date: string;
  counts: Record<AccessGroup, number>;
  total: number;
  /** Who, by group: user ids, for checking a day by hand. Never sent to the page. */
  who?: Record<AccessGroup, string[]>;
}

const DAY = 86400_000;
const sydneyDay = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
/** Midnight Sydney at the start of a yyyy-mm-dd, as epoch ms. */
function dayStart(date: string): number {
  const noon = new Date(`${date}T12:00:00Z`);
  const hour = Number(noon.toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hour12: false }));
  return noon.getTime() - hour * 3600_000;
}

const LIVE = ["trialing", "active", "past_due"];
/** A racing day counts from 10am Sydney: access that ran out overnight did not see a race. */
const RACING_FROM = 10 * 3600_000;

interface SubState { at: number; status: string; until: number; plan: string | null }
interface Span { from: number; to: number }

export async function accessHistory(from = "2026-09-11", to = sydneyDay(Date.now())): Promise<AccessDay[]> {
  const db = supabaseAdmin();
  const [{ data: profs }, { data: affs }, { data: subs }, { data: gifts }, { data: igs }, { data: passes }, { data: graces }] = await Promise.all([
    db.from("profiles").select("id, email, is_admin"),
    db.from("affiliates").select("user_id").not("user_id", "is", null),
    db.from("events").select("user_id, created_at, plan, meta").eq("kind", "subscription").order("created_at"),
    db.from("events").select("user_id, created_at, meta").eq("kind", "admin").in("meta->>action", ["add_days", "invite"]).order("created_at"),
    db.from("events").select("user_id, created_at, meta").eq("kind", "ig_follow_claim").order("created_at"),
    db.from("day_passes").select("user_id, date").gte("date", from).lte("date", to),
    db.from("events").select("user_id, created_at, meta").eq("kind", "payment_grace"),
  ]);
  // Past due means the grace week, not the period Stripe opened; before the week existed (26 Sep) the
  // events logged the period, so a past-due state is capped at its grace week or seven days.
  const graceEnds = new Map<string, { at: number; until: number }[]>();
  for (const g of (graces ?? []) as { user_id: string; created_at: string; meta: { until?: string } | null }[]) {
    if (g.meta?.until) graceEnds.set(g.user_id, [...(graceEnds.get(g.user_id) ?? []), { at: new Date(g.created_at).getTime(), until: new Date(g.meta.until).getTime() }]);
  }
  const pastDueUntil = (userId: string, s: SubState) =>
    Math.min(s.until, (graceEnds.get(userId) ?? []).find((g) => g.at >= s.at - DAY && g.at <= s.at + 7 * DAY)?.until ?? s.at + 7 * DAY);
  const tipsters = new Set((affs ?? []).map((a) => a.user_id as string));
  const left = new Set(
    ((profs ?? []) as { id: string; email: string | null; is_admin: boolean | null }[])
      .filter((p) => p.is_admin || isAdminEmail(p.email) || tipsters.has(p.id) || /@theoverlay\.com\.au$/i.test(p.email ?? ""))
      .map((p) => p.id),
  );

  const states = new Map<string, SubState[]>();
  for (const e of (subs ?? []) as { user_id: string; created_at: string; plan: string | null; meta: { status?: string; until?: string } | null }[]) {
    if (left.has(e.user_id)) continue;
    const list = states.get(e.user_id) ?? [];
    const status = e.meta?.status ?? "";
    // The end of another subscription while a different plan is live (a superseded trial) changes nothing.
    const last = list.at(-1);
    if (!LIVE.includes(status) && last && LIVE.includes(last.status) && last.plan !== e.plan && last.until > new Date(e.created_at).getTime()) continue;
    list.push({ at: new Date(e.created_at).getTime(), status: e.meta?.status ?? "", until: e.meta?.until ? new Date(e.meta.until).getTime() : 0, plan: e.plan });
    states.set(e.user_id, list);
  }

  // Gifted time stacks the way the admin action does: from the later of now and the gift already running.
  const giftSpans = new Map<string, Span[]>();
  const addGift = (userId: string, from: number, to: number) => {
    if (left.has(userId) || to <= from) return;
    giftSpans.set(userId, [...(giftSpans.get(userId) ?? []), { from, to }]);
  };
  for (const e of (gifts ?? []) as { user_id: string; created_at: string; meta: { action?: string; days?: number; admin?: boolean } | null }[]) {
    const days = Number(e.meta?.days ?? 0);
    if (!days || e.meta?.admin) continue;
    const at = new Date(e.created_at).getTime();
    const running = Math.max(at, ...(giftSpans.get(e.user_id) ?? []).map((s) => s.to));
    const start = e.meta?.action === "add_days" ? running : at;
    addGift(e.user_id, start, start + days * DAY);
  }
  // A follow claim with `until` is free days; one with `nextBill` moved a trial, which the subscription events carry.
  for (const e of (igs ?? []) as { user_id: string; created_at: string; meta: { until?: string } | null }[]) {
    if (e.meta?.until) addGift(e.user_id, new Date(e.created_at).getTime(), new Date(e.meta.until).getTime());
  }

  const passOn = new Map<string, Set<string>>();
  for (const p of (passes ?? []) as { user_id: string; date: string }[]) {
    if (left.has(p.user_id)) continue;
    passOn.set(p.date, (passOn.get(p.date) ?? new Set()).add(p.user_id));
  }

  const out: AccessDay[] = [];
  for (let d = from; d <= to; d = sydneyDay(dayStart(d) + 36 * 3600_000)) {
    const start = dayStart(d) + RACING_FROM, end = dayStart(d) + DAY;
    const group = new Map<string, AccessGroup>();
    for (const [userId, list] of states) {
      // The state in force as the day opened, and any change during it: access at any point counts.
      const before = list.filter((s) => s.at <= start).at(-1);
      const during = list.filter((s) => s.at > start && s.at < end);
      for (const s of [before, ...during]) {
        if (!s || !LIVE.includes(s.status) || !planCovers(s.plan ?? undefined, d)) continue;
        if ((s.status === "past_due" ? pastDueUntil(userId, s) : s.until) <= start) continue;
        if (s.status !== "trialing") group.set(userId, "paying");
        else if (group.get(userId) !== "paying") group.set(userId, "trial");
      }
    }
    for (const userId of passOn.get(d) ?? []) if (!group.has(userId)) group.set(userId, "pass");
    for (const [userId, spans] of giftSpans) if (!group.has(userId) && spans.some((s) => s.from < end && s.to > start)) group.set(userId, "gift");
    const counts = { paying: 0, trial: 0, pass: 0, gift: 0 } as Record<AccessGroup, number>;
    const who = { paying: [], trial: [], pass: [], gift: [] } as Record<AccessGroup, string[]>;
    for (const [userId, g] of group) {
      counts[g]++;
      who[g].push(userId);
    }
    out.push({ date: d, counts, total: group.size, who });
  }
  return out;
}
