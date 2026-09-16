import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";

/**
 * What people do on the site, from the page_view events the tracker writes:
 * which sections they go to, which races and tipsters, who follows whom,
 * and who is most active.
 */

export type Area = "home" | "race" | "tips" | "tipsters" | "tipster" | "horses" | "review" | "pricing" | "account" | "method" | "faq" | "auth" | "other";

/** The public paths, sorted into the areas the activity page reports on. */
export function areaOf(path: string): { area: Area; raceId?: string; meetingId?: string; date?: string; code?: string } {
  const p = path.split("?")[0];
  if (p === "/") return { area: "home" };
  const race = p.match(/^\/racing\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/([^/]+)/);
  if (race) return { area: "race", date: race[1], meetingId: race[2], raceId: race[3] };
  if (p.startsWith("/tips")) return { area: "tips" };
  if (p === "/tipsters") return { area: "tipsters" };
  const t = p.match(/^\/t\/([^/]+)/);
  if (t) return { area: "tipster", code: t[1] };
  if (p.startsWith("/tipster")) return { area: "tipster" };
  if (p.startsWith("/horses")) return { area: "horses" };
  if (p.startsWith("/review")) return { area: "review" };
  if (p.startsWith("/pricing")) return { area: "pricing" };
  if (p.startsWith("/account")) return { area: "account" };
  if (p.startsWith("/method")) return { area: "method" };
  if (p.startsWith("/faq")) return { area: "faq" };
  if (/^\/(login|signup|forgot|reset|invite|join)/.test(p)) return { area: "auth" };
  return { area: "other" };
}

export const AREA_LABEL: Record<Area, string> = {
  home: "Home",
  race: "Race pages",
  tips: "Tips",
  tipsters: "Tipsters",
  tipster: "A tipster's page",
  horses: "Horses",
  review: "Saturday review",
  pricing: "Pricing",
  account: "Account",
  method: "Method",
  faq: "FAQ",
  auth: "Sign in and sign up",
  other: "Other",
};

export interface ViewRow {
  id: number;
  user_id: string | null;
  created_at: string;
  meta: { path?: string; area?: Area; raceId?: string; meetingId?: string; date?: string; code?: string; vid?: string; referrer?: string } | null;
}

export interface ActivityReport {
  days: number;
  views: number;
  /** Distinct signed-in members and distinct anonymous visitors. */
  members: number;
  visitors: number;
  byArea: { area: Area; views: number; people: number }[];
  byDay: { day: string; views: number; people: number }[];
  topRaces: { key: string; date: string; meetingId: string; raceId: string; views: number; people: number }[];
  topTipsters: { code: string; views: number; people: number }[];
  /** The most active people: members by email, visitors by id. */
  people: { id: string; email: string | null; views: number; last: string; areas: string; races: number }[];
  follows: { follower: string; followerId: string; tipster: string; tipsterCode?: string; since: string }[];
  referrers: { host: string; views: number }[];
}

const who = (v: ViewRow) => v.user_id ?? (v.meta?.vid ? `v:${v.meta.vid}` : "?");

export async function activityReport(days = 7): Promise<ActivityReport> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [{ data: rows }, { data: profiles }, { data: follows }, { data: tipsters }] = await Promise.all([
    db.from("events").select("id, user_id, created_at, meta").eq("kind", "page_view").gte("created_at", since).order("created_at", { ascending: false }).limit(20000),
    db.from("profiles").select("id, email"),
    db.from("follows").select("user_id, tipster_id, created_at"),
    db.from("affiliates").select("id, name, code"),
  ]);
  const views = (rows ?? []) as ViewRow[];
  const email = new Map(((profiles ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));
  const tipsterName = new Map(((tipsters ?? []) as { id: string; name: string; code: string }[]).map((t) => [t.id, t.name]));
  const tipsterCode = new Map(((tipsters ?? []) as { id: string; name: string; code: string }[]).map((t) => [t.id, t.code]));
  const tipsterByCode = new Map(((tipsters ?? []) as { id: string; name: string; code: string }[]).map((t) => [t.code, t.name]));

  const tally = <K extends string>(key: (v: ViewRow) => K | undefined) => {
    const m = new Map<K, { views: number; people: Set<string> }>();
    for (const v of views) {
      const k = key(v);
      if (!k) continue;
      const e = m.get(k) ?? { views: 0, people: new Set<string>() };
      e.views++;
      e.people.add(who(v));
      m.set(k, e);
    }
    return [...m.entries()].map(([k, e]) => ({ key: k, views: e.views, people: e.people.size })).sort((a, b) => b.views - a.views);
  };

  const byArea = tally((v) => v.meta?.area).map((x) => ({ area: x.key as Area, views: x.views, people: x.people }));
  const byDay = tally((v) => new Date(v.created_at).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }))
    .map((x) => ({ day: x.key, views: x.views, people: x.people }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const topRaces = tally((v) => (v.meta?.raceId ? `${v.meta.date}|${v.meta.meetingId}|${v.meta.raceId}` : undefined))
    .slice(0, 15)
    .map((x) => {
      const [date, meetingId, raceId] = x.key.split("|");
      return { key: x.key, date, meetingId, raceId, views: x.views, people: x.people };
    });
  const topTipsters = tally((v) => v.meta?.code).slice(0, 10).map((x) => ({ code: tipsterByCode.get(x.key) ?? x.key, views: x.views, people: x.people }));
  const referrers = tally((v) => v.meta?.referrer).slice(0, 10).map((x) => ({ host: x.key, views: x.views }));

  const perPerson = new Map<string, { views: number; last: string; areas: Map<string, number>; races: Set<string> }>();
  for (const v of views) {
    const id = who(v);
    const e = perPerson.get(id) ?? { views: 0, last: v.created_at, areas: new Map(), races: new Set() };
    e.views++;
    if (v.created_at > e.last) e.last = v.created_at;
    const a = v.meta?.area ?? "other";
    e.areas.set(a, (e.areas.get(a) ?? 0) + 1);
    if (v.meta?.raceId) e.races.add(v.meta.raceId);
    perPerson.set(id, e);
  }
  const people = [...perPerson.entries()]
    .map(([id, e]) => ({
      id,
      email: id.startsWith("v:") ? null : (email.get(id) ?? null),
      views: e.views,
      last: e.last,
      areas: [...e.areas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, n]) => `${AREA_LABEL[a as Area] ?? a} ${n}`).join(", "),
      races: e.races.size,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 40);

  return {
    days,
    views: views.length,
    members: new Set(views.filter((v) => v.user_id).map((v) => v.user_id)).size,
    visitors: new Set(views.filter((v) => !v.user_id && v.meta?.vid).map((v) => v.meta!.vid)).size,
    byArea,
    byDay,
    topRaces,
    topTipsters,
    people,
    follows: ((follows ?? []) as { user_id: string; tipster_id: string; created_at: string }[])
      .map((f) => ({ follower: email.get(f.user_id) ?? f.user_id, followerId: f.user_id, tipster: tipsterName.get(f.tipster_id) ?? f.tipster_id, tipsterCode: tipsterCode.get(f.tipster_id), since: f.created_at }))
      .sort((a, b) => b.since.localeCompare(a.since)),
    referrers,
  };
}

/** One member's last page views, newest first. */
export async function memberViews(userId: string, limit = 40): Promise<ViewRow[]> {
  const { data } = await supabaseAdmin().from("events").select("id, user_id, created_at, meta").eq("kind", "page_view").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as ViewRow[];
}
