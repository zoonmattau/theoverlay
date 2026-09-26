import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";

/**
 * What people do on the site, from the page_view events the tracker writes:
 * which sections they go to, which races and tipsters, who follows whom,
 * and who is most active.
 */

export type Area = "home" | "race" | "tips" | "tipsters" | "tipster" | "horses" | "datahub" | "review" | "pricing" | "account" | "method" | "faq" | "auth" | "other";

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
  if (p.startsWith("/horses") || p.startsWith("/data/horses")) return { area: "horses" };
  if (p.startsWith("/data")) return { area: "datahub" };
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
  datahub: "Datahub",
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
  meta: { path?: string; area?: Area; raceId?: string; meetingId?: string; date?: string; code?: string; vid?: string; referrer?: string; utm?: { source?: string; medium?: string; campaign?: string; content?: string }; clid?: string } | null;
}

export interface ActivityReport {
  days: number;
  views: number;
  /** Distinct signed-in members and distinct anonymous visitors. */
  members: number;
  visitors: number;
  byArea: { area: Area; views: number; people: number }[];
  /** Views and people each day, and how many of those people first came that day from an ad. */
  byDay: { day: string; views: number; people: number; ads: number }[];
  topRaces: { key: string; date: string; meetingId: string; raceId: string; views: number; people: number }[];
  topTipsters: { code: string; views: number; people: number }[];
  /** The people behind the count: members by email, visitors by id and where they came from. Every one of them when a cut is asked for, else the forty most active. */
  people: { id: string; email: string | null; from: string | null; views: number; last: string; areas: string; races: number }[];
  /** The cut the people list is for, if any. */
  cut?: { area?: Area; day?: string };
  follows: { follower: string; followerId: string; tipster: string; tipsterCode?: string; since: string }[];
  /** Where people first came from in the window: an ad network, a tagged campaign or the referring site. */
  sources: { source: string; people: number }[];
}

/** Where a view came from: an ad (a paid campaign tag, or Google's click id) first, then a tagged campaign, then the referring site. */
export function sourceOf(meta: ViewRow["meta"]): string {
  const u = meta?.utm;
  const s = (u?.source ?? "").toLowerCase();
  const paid = /paid|cpc|ppc|ads?$/.test((u?.medium ?? "").toLowerCase());
  // Facebook puts fbclid on every link clicked there, a post's as much as an ad's, so only a paid tag says Meta ads.
  if (paid && /meta|facebook|fb|instagram|ig/.test(s)) return "Meta ads";
  if (meta?.clid === "google" || (paid && /google/.test(s))) return "Google ads";
  if (meta?.clid === "tiktok") return "TikTok ads";
  if (meta?.clid === "microsoft") return "Microsoft ads";
  if (u?.source) return u.campaign ? `${u.source} (${u.campaign})` : u.source;
  return meta?.referrer ?? "direct";
}

/**
 * Who a view belongs to: the member, else the visitor cookie. With `owners`,
 * a cookie later seen signed in is that member's, so a person who read the
 * site and then logged in is one person, not a visitor and a member.
 */
const who = (v: ViewRow, owners?: Map<string, string>) => v.user_id ?? (v.meta?.vid ? (owners?.get(v.meta.vid) ?? `v:${v.meta.vid}`) : "?");

/** The visitor cookies that have been seen signed in, and whose. */
function cookieOwners(views: ViewRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const v of views) if (v.user_id && v.meta?.vid && !m.has(v.meta.vid)) m.set(v.meta.vid, v.user_id);
  return m;
}

/**
 * Every page view since a moment, newest first. The server hands back a
 * thousand rows a request whatever the limit asks, so a week of 2,400 views
 * read as its newest thousand until 22 Sep 2026: the report is paged.
 */
async function pageViewsSince(since: string): Promise<ViewRow[]> {
  const db = supabaseAdmin();
  const out: ViewRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await db.from("events").select("id, user_id, created_at, meta").eq("kind", "page_view").gte("created_at", since).order("created_at", { ascending: false }).range(from, from + 999);
    if (error) { console.error("[activity]", error.message); break; }
    out.push(...((data ?? []) as ViewRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function activityReport(days = 7, cut: { area?: Area; day?: string } = {}): Promise<ActivityReport> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [views, { data: profiles }, { data: follows }, { data: tipsters }] = await Promise.all([
    pageViewsSince(since),
    db.from("profiles").select("id, email"),
    db.from("follows").select("user_id, tipster_id, created_at"),
    db.from("affiliates").select("id, name, code"),
  ]);
  const owners = cookieOwners(views);
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
      e.people.add(who(v, owners));
      m.set(k, e);
    }
    return [...m.entries()].map(([k, e]) => ({ key: k, views: e.views, people: e.people.size })).sort((a, b) => b.views - a.views);
  };

  const byArea = tally((v) => v.meta?.area).map((x) => ({ area: x.key as Area, views: x.views, people: x.people }));
  const dayOf = (v: ViewRow) => new Date(v.created_at).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  // Each person's first view in the window: where they came from, and the day they came.
  const firstView = new Map<string, ViewRow>();
  for (const v of views) {
    const id = who(v, owners);
    const f = firstView.get(id);
    if (!f || v.created_at < f.created_at) firstView.set(id, v);
  }
  const adsByDay = new Map<string, number>();
  const bySource = new Map<string, number>();
  for (const v of firstView.values()) {
    const src = sourceOf(v.meta);
    bySource.set(src, (bySource.get(src) ?? 0) + 1);
    if (src.endsWith(" ads")) adsByDay.set(dayOf(v), (adsByDay.get(dayOf(v)) ?? 0) + 1);
  }
  const sources = [...bySource.entries()].map(([source, people]) => ({ source, people })).sort((a, b) => b.people - a.people).slice(0, 12);
  const byDay = tally(dayOf)
    .map((x) => ({ day: x.key, views: x.views, people: x.people, ads: adsByDay.get(x.key) ?? 0 }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const topRaces = tally((v) => (v.meta?.raceId ? `${v.meta.date}|${v.meta.meetingId}|${v.meta.raceId}` : undefined))
    .slice(0, 15)
    .map((x) => {
      const [date, meetingId, raceId] = x.key.split("|");
      return { key: x.key, date, meetingId, raceId, views: x.views, people: x.people };
    });
  const topTipsters = tally((v) => v.meta?.code).slice(0, 10).map((x) => ({ code: tipsterByCode.get(x.key) ?? x.key, views: x.views, people: x.people }));

  // The people list: everyone who viewed the cut asked for (an area, a day), else everyone, forty most active shown.
  const inCut = (v: ViewRow) => (!cut.area || v.meta?.area === cut.area) && (!cut.day || new Date(v.created_at).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }) === cut.day);
  const cutIds = new Set(views.filter(inCut).map((v) => who(v, owners)));
  const perPerson = new Map<string, { views: number; last: string; first: string; from: string | null; areas: Map<string, number>; races: Set<string> }>();
  for (const v of views) {
    const id = who(v, owners);
    if (!cutIds.has(id)) continue;
    const e = perPerson.get(id) ?? { views: 0, last: v.created_at, first: v.created_at, from: null, areas: new Map(), races: new Set() };
    e.views++;
    if (v.created_at > e.last) e.last = v.created_at;
    // Where they came from: their earliest view in the window, an ad or the referring site.
    if (v.created_at <= e.first) { e.first = v.created_at; e.from = sourceOf(v.meta); }
    const a = v.meta?.area ?? "other";
    e.areas.set(a, (e.areas.get(a) ?? 0) + 1);
    if (v.meta?.raceId) e.races.add(v.meta.raceId);
    perPerson.set(id, e);
  }
  const people = [...perPerson.entries()]
    .map(([id, e]) => ({
      id,
      email: id.startsWith("v:") ? null : (email.get(id) ?? null),
      from: e.from,
      views: e.views,
      last: e.last,
      areas: [...e.areas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, n]) => `${AREA_LABEL[a as Area] ?? a} ${n}`).join(", "),
      races: e.races.size,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, cut.area || cut.day ? 1000 : 40);

  return {
    days,
    cut: cut.area || cut.day ? cut : undefined,
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
    sources,
  };
}

/** One member's last page views, newest first. */
export async function memberViews(userId: string, limit = 40): Promise<ViewRow[]> {
  const { data } = await supabaseAdmin().from("events").select("id, user_id, created_at, meta").eq("kind", "page_view").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as ViewRow[];
}

export interface LivePage {
  path: string;
  label: string;
  people: { id: string; email: string | null; ago: number }[];
}

/** A path as a person would say it. */
function pageLabel(path: string): string {
  if (path === "/") return "Home";
  const race = path.match(/^\/racing\/\d{4}-\d{2}-\d{2}\/([a-z0-9-]+)-\d{8}\/[A-Z]+_\d+_(\d+)/);
  if (race) return `${race[1].split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")} R${race[2]}`;
  const tipster = path.match(/^\/t\/(.+)$/);
  if (tipster) return `Tipster ${tipster[1]}`;
  return AREA_LABEL[areaOf(path).area] === "Other" ? path : `${AREA_LABEL[areaOf(path).area]}${path.split("/").length > 2 ? ` · ${path.split("/").slice(2).join("/")}` : ""}`;
}

/**
 * Who is on the site right now: everyone with a page view in the last few
 * minutes, on the page they were last seen on. A member by email, a visitor
 * by cookie.
 */
export async function liveNow(minutes = 5): Promise<{ pages: LivePage[]; people: number }> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const db = supabaseAdmin();
  const views = await pageViewsSince(since);
  const ids = [...new Set(views.map((v) => v.user_id).filter((u): u is string => Boolean(u)))];
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, email").in("id", ids) : { data: [] };
  const email = new Map(((profiles ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));
  // Newest first, so the first view seen for a person is where they are now.
  const seen = new Set<string>();
  const byPath = new Map<string, LivePage>();
  const now = Date.now();
  for (const v of views) {
    const id = who(v);
    if (id === "?" || seen.has(id)) continue;
    seen.add(id);
    const path = v.meta?.path ?? "/";
    const page = byPath.get(path) ?? { path, label: pageLabel(path), people: [] };
    page.people.push({ id, email: id.startsWith("v:") ? null : (email.get(id) ?? null), ago: Math.round((now - new Date(v.created_at).getTime()) / 1000) });
    byPath.set(path, page);
  }
  return { pages: [...byPath.values()].sort((a, b) => b.people.length - a.people.length), people: seen.size };
}
