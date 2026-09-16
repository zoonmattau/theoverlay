import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import { isAdminEmail } from "@/lib/auth";
import { longDate } from "@/lib/format";
import type { StoredCard } from "@/lib/model/store";
import type { PublishedMeeting, PublishedRace, PublishedRunner } from "@/lib/model/types";

/**
 * The Overlay's Discord: the calls posted into the server each morning, the
 * results at the end of the day, and the Member role kept in step with who
 * has paid access. Needs DISCORD_BOT_TOKEN and DISCORD_GUILD_ID; without
 * them every call here is a quiet no-op. Account linking needs
 * DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET as well.
 */

const API = "https://discord.com/api/v10";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
/** Channel names as the setup script made them. */
export const CHANNELS = {
  overlay: "overlay-of-the-day",
  primes: "prime-overlays",
  calls: "bets-and-lays",
  results: "results",
  free: "free-race",
  early: "early-look",
  review: "saturday-review",
} as const;
export const MEMBER_ROLE = "Member";

export const discordConfigured = () => Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID);
export const discordLinkConfigured = () => discordConfigured() && Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
const guild = () => process.env.DISCORD_GUILD_ID!;

async function api<T>(method: string, path: string, body?: unknown, auth = `Bot ${process.env.DISCORD_BOT_TOKEN}`): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: auth, "content-type": "application/json", "user-agent": "TheOverlay/1.0" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.status === 429) {
      const wait = Number((await res.json().catch(() => ({})))?.retry_after ?? 2);
      await new Promise((r) => setTimeout(r, wait * 1000 + 250));
      continue;
    }
    if (!res.ok) throw new Error(`Discord ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  throw new Error(`Discord ${method} ${path}: rate limited`);
}

/* ---------- Channels and messages ---------- */

let channelIds: Promise<Map<string, string>> | undefined;
/** Channel ids by name, read once per server instance. */
function channels(): Promise<Map<string, string>> {
  channelIds ??= api<{ id: string; name: string }[]>("GET", `/guilds/${guild()}/channels`).then((list) => new Map(list.map((c) => [c.name, c.id])));
  return channelIds;
}

let roleIds: Promise<Map<string, string>> | undefined;
function roles(): Promise<Map<string, string>> {
  roleIds ??= api<{ id: string; name: string }[]>("GET", `/guilds/${guild()}/roles`).then((list) => new Map(list.map((r) => [r.name, r.id])));
  return roleIds;
}

/** Splits on line breaks so no message passes Discord's 2000 characters. */
function chunks(text: string, max = 1900): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length + 1 > max) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur) out.push(cur);
  return out;
}

async function send(channelName: string, text: string): Promise<string | undefined> {
  const id = (await channels()).get(channelName);
  if (!id) {
    console.error("[discord] no channel named", channelName);
    return undefined;
  }
  let first: string | undefined;
  for (const content of chunks(text)) {
    const m = await api<{ id: string }>("POST", `/channels/${id}/messages`, { content, allowed_mentions: { parse: [] }, flags: 1 << 2 });
    first ??= m.id;
  }
  return first;
}

/** Whether this kind of post has gone out for the date, and remembers it once it has. */
async function once(date: string, kind: string, post: () => Promise<string | undefined>): Promise<boolean> {
  const db = supabaseAdmin();
  const { data } = await db.from("discord_posts").select("kind").eq("date", date).eq("kind", kind).maybeSingle();
  if (data) return false;
  const messageId = await post();
  const { error } = await db.from("discord_posts").insert({ date, kind, message_id: messageId ?? null });
  if (error) console.error("[discord]", error.message);
  return true;
}

/* ---------- The calls ---------- */

const price = (n?: number) => (n ? `$${n.toFixed(2)}` : "");
const raceUrl = (date: string, m: PublishedMeeting, r: PublishedRace) => `${SITE}/racing/${date}/${encodeURIComponent(m.meetingId)}/${encodeURIComponent(r.raceId)}`;
/** Sydney time, "1:45pm". */
const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }).replace(" ", "") : "");

interface Call {
  m: PublishedMeeting;
  r: PublishedRace;
  x: PublishedRunner;
  tag?: string;
}

function callsOn(card: StoredCard): Call[] {
  const tagOf = new Map(card.selections.map((s) => [`${s.raceId}:${s.tabNumber}`, s.tag]));
  return card.meetings
    .flatMap((m) => m.races.flatMap((r) => r.runners.filter((x) => x.signal && !x.scratched).map((x) => ({ m, r, x, tag: tagOf.get(`${r.raceId}:${x.tabNumber}`) }))))
    .sort((a, b) => (a.r.jumpTime ?? "").localeCompare(b.r.jumpTime ?? ""));
}

/**
 * One call as a line: track and race, then the runner, then the call. The
 * square is the site's colour convention, lime for a Prime, blue for a bet,
 * red for a lay.
 */
function line(c: Call, withTrack = false): string {
  const prime = c.x.prime || c.tag === "prime_overlay" || c.tag === "top_overlay";
  const square = c.x.signal === "lay" ? "🟥" : prime ? "🟩" : "🟦";
  const side = c.x.signal === "lay" ? "Lay" : prime ? "Prime" : "Bet";
  return `${square} ${withTrack ? `${c.m.track} ` : ""}R${c.r.raceNumber} ${clock(c.r.jumpTime)}  **${c.x.tabNumber}. ${c.x.horseName}**  ${side} ${price(c.x.marketPrice)}, rated ${price(c.x.ratedPrice)}`;
}

/** Every call, a heading per meeting and a blank line between meetings, races in jump order. */
function lines(calls: Call[]): string {
  const groups = new Map<string, Call[]>();
  for (const c of calls) groups.set(c.m.track, [...(groups.get(c.m.track) ?? []), c]);
  return [...groups.entries()].map(([track, list]) => `**${track.toUpperCase()}**\n${list.map((c) => line(c)).join("\n")}`).join("\n\n");
}

/**
 * The morning posts: the Overlay of the Day, the Primes, every bet and lay,
 * and the free race. Each goes once per date, so a rebuild never repeats them.
 */
export async function postCalls(date: string, card: StoredCard, opts: { early?: boolean } = {}): Promise<void> {
  if (!discordConfigured()) return;
  const calls = callsOn(card);
  if (calls.length === 0) return;
  const day = longDate(date);
  try {
    if (opts.early) {
      // Tomorrow's card the night before, for members only.
      await once(date, "early", () => send(CHANNELS.early, `**Early look, ${day}.** Prices will move by morning, the calls may too.\n\n${lines(calls)}`));
      return;
    }
    const top = calls.find((c) => c.tag === "top_overlay");
    if (top) {
      await once(date, "overlay", () =>
        send(CHANNELS.overlay, `**Overlay of the Day, ${day}**\n${line(top, true)}${top.x.why ? `\n> ${top.x.why}` : ""}\n${raceUrl(date, top.m, top.r)}`),
      );
    }
    const primes = calls.filter((c) => c.x.signal === "back" && (c.x.prime || c.tag === "prime_overlay" || c.tag === "top_overlay"));
    if (primes.length) await once(date, "primes", () => send(CHANNELS.primes, `**Prime Overlays, ${day}**\n${primes.map((c) => line(c, true)).join("\n")}`));
    const bets = calls.filter((c) => c.x.signal === "back").length;
    const lays = calls.length - bets;
    await once(date, "calls", () => send(CHANNELS.calls, `**${day}: ${bets} ${bets === 1 ? "bet" : "bets"}, ${lays} ${lays === 1 ? "lay" : "lays"}.**\n\n${lines(calls)}\n\n${SITE}/`));
    const free = card.meetings.flatMap((m) => m.races.map((r) => ({ m, r }))).find(({ r }) => r.raceId === card.freeRaceId);
    if (free) {
      await once(date, "free", () =>
        send(CHANNELS.free, `**Free race of the day, ${day}**\n${free.m.track} R${free.r.raceNumber}, ${free.r.distance}m at ${clock(free.r.jumpTime)}. Our top four, a rated price for every runner and the calls, open to all.\n${raceUrl(date, free.m, free.r)}`),
      );
    }
  } catch (err) {
    console.error("[discord] calls", err);
  }
}

/** The day's ledger once every race has run. Posted once. */
/** The public Saturday review, once, when an admin publishes it. */
export async function postReview(review: { date: string; intro: string; storylines: { kind: string; text: string }[] }): Promise<void> {
  if (!discordConfigured()) return;
  try {
    await once(review.date, "review", () =>
      send(
        CHANNELS.review,
        [`**Saturday review, ${longDate(review.date)}.**`, review.intro, "", ...review.storylines.map((s) => `**${s.kind[0].toUpperCase()}${s.kind.slice(1)}.** ${s.text}`), "", `${SITE}/review/${review.date}`].join("\n"),
      ),
    );
  } catch (err) {
    console.error("[discord] review", err);
  }
}

export async function postResults(date: string, card: StoredCard): Promise<void> {
  if (!discordConfigured()) return;
  const races = card.meetings.flatMap((m) => m.races);
  if (races.length === 0 || !races.every((r) => r.result?.length)) return;
  const calls = callsOn(card);
  if (calls.length === 0) return;
  try {
    await once(date, "results", () => {
      const settle = (c: Call) => {
        const won = c.x.finishPosition === 1;
        const p = c.x.marketPrice ?? 0;
        return c.x.signal === "back" ? (won ? p - 1 : -1) : won ? -(p - 1) : 1;
      };
      const rows = calls.map((c) => ({ c, units: settle(c) }));
      const total = rows.reduce((a, r) => a + r.units, 0);
      const bets = rows.filter((r) => r.c.x.signal === "back");
      const lays = rows.filter((r) => r.c.x.signal === "lay");
      const sum = (xs: typeof rows) => xs.reduce((a, r) => a + r.units, 0);
      const fmt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}u`;
      const finish = (c: Call) => (c.x.finishPosition === 1 ? "won" : c.x.finishPosition === 0 ? "did not finish" : `${c.x.finishPosition}${["th", "st", "nd", "rd"][c.x.finishPosition && c.x.finishPosition < 4 ? c.x.finishPosition : 0]}`);
      const body = rows.map(({ c, units }) => `${units > 0 ? "✅" : "❌"} ${c.m.track} R${c.r.raceNumber} **${c.x.tabNumber}. ${c.x.horseName}** ${c.x.signal === "lay" ? "Lay" : "Bet"} ${price(c.x.marketPrice)}, ${finish(c)}, ${fmt(units)}`).join("\n");
      return send(
        CHANNELS.results,
        `**${longDate(date)}: ${fmt(total)}** level stakes, one unit a call.\nBets ${bets.filter((r) => r.units > 0).length} of ${bets.length} won, ${fmt(sum(bets))}. Lays ${lays.filter((r) => r.units > 0).length} of ${lays.length} landed, ${fmt(sum(lays))}.\n\n${body}\n\nThe record: ${SITE}/#record`,
      );
    });
  } catch (err) {
    console.error("[discord] results", err);
  }
}

/* ---------- Account linking and the Member role ---------- */

/** Where the account page sends someone to link their Discord. */
export function discordAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: `${SITE}/api/discord/callback`,
    response_type: "code",
    scope: "identify guilds.join",
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

/** Swaps the code from the callback for the Discord user behind it. */
export async function discordUserFromCode(code: string): Promise<{ id: string; username: string; accessToken: string }> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${SITE}/api/discord/callback`,
    }),
  });
  if (!res.ok) throw new Error(`Discord token: ${res.status}`);
  const token = (await res.json()) as { access_token: string };
  const user = await api<{ id: string; username: string; global_name?: string | null }>("GET", "/users/@me", undefined, `Bearer ${token.access_token}`);
  return { id: user.id, username: user.global_name || user.username, accessToken: token.access_token };
}

interface MemberRow {
  id: string;
  email: string | null;
  access_until: string | null;
  paused_at: string | null;
  bonus_until: string | null;
  is_admin: boolean | null;
  discord_id: string | null;
}
const MEMBER_COLS = "id, email, access_until, paused_at, bonus_until, is_admin, discord_id";

/** Paid access right now, on any plan: what the Member role means. */
function memberNow(p: MemberRow, tipster: boolean): boolean {
  if (p.is_admin || isAdminEmail(p.email) || tipster) return true;
  if (p.paused_at) return false;
  const now = Date.now();
  if (p.access_until && new Date(p.access_until).getTime() > now) return true;
  return Boolean(p.bonus_until && new Date(p.bonus_until).getTime() > now);
}

/**
 * Puts the linked Discord account in the server if it is not there (needs
 * the access token from linking) and gives or takes the Member role.
 */
async function applyRole(discordId: string, member: boolean, accessToken?: string): Promise<void> {
  const roleId = (await roles()).get(MEMBER_ROLE);
  if (!roleId) throw new Error("No Member role on the server.");
  const base = `/guilds/${guild()}/members/${discordId}`;
  if (accessToken) {
    // Joins them, or is a no-op when they are in already.
    await api("PUT", base, { access_token: accessToken, ...(member ? { roles: [roleId] } : {}) });
  }
  try {
    await api(member ? "PUT" : "DELETE", `${base}/roles/${roleId}`);
  } catch (err) {
    // Not in the server: nothing to give the role to.
    if (!/404/.test(String(err))) throw err;
  }
}

/** Takes the Member role off a Discord account that is no longer linked. */
export async function removeDiscordMember(discordId: string): Promise<void> {
  if (!discordConfigured()) return;
  try {
    await applyRole(discordId, false);
  } catch (err) {
    console.error("[discord] unlink", err);
  }
}

/** One member's role, after linking or after their access changed. */
export async function syncDiscordMember(userId: string, accessToken?: string): Promise<void> {
  if (!discordConfigured()) return;
  const db = supabaseAdmin();
  const [{ data: p }, { data: aff }] = await Promise.all([
    db.from("profiles").select(MEMBER_COLS).eq("id", userId).maybeSingle(),
    db.from("affiliates").select("id").eq("user_id", userId).eq("active", true).maybeSingle(),
  ]);
  if (!p?.discord_id) return;
  try {
    await applyRole(p.discord_id, memberNow(p as MemberRow, Boolean(aff)), accessToken);
  } catch (err) {
    console.error("[discord] sync", userId, err);
  }
}

/** Every linked account, once a day, so a lapsed plan loses the role even if a webhook was missed. */
export async function syncDiscordMembers(): Promise<{ linked: number; members: number }> {
  if (!discordConfigured()) return { linked: 0, members: 0 };
  const db = supabaseAdmin();
  const [{ data: rows }, { data: affs }] = await Promise.all([
    db.from("profiles").select(MEMBER_COLS).not("discord_id", "is", null),
    db.from("affiliates").select("user_id").eq("active", true),
  ]);
  const tipsters = new Set((affs ?? []).map((a) => String(a.user_id)));
  let members = 0;
  for (const p of (rows ?? []) as MemberRow[]) {
    const member = memberNow(p, tipsters.has(p.id));
    if (member) members++;
    try {
      await applyRole(p.discord_id!, member);
    } catch (err) {
      console.error("[discord] sweep", p.id, err);
    }
  }
  return { linked: rows?.length ?? 0, members };
}
