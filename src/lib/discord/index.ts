import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import { isAdminEmail } from "@/lib/auth";
import { longDate } from "@/lib/format";
import type { StoredCard } from "@/lib/model/store";
import { callPrice, isRoughie, stakeOf } from "@/lib/model/types";
import { callLimit, inCallLock } from "@/lib/model/publish";
import { settledAt } from "@/lib/tips";
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
  winners: "winners",
  tipsters: "tipster-calls",
} as const;
export const MEMBER_ROLE = "Member";
/** Tipster accounts carry this as well, which opens tipster-calls to post in and the lounge to see. */
export const TIPSTER_ROLE = "Tipster";

/** A local server never posts to the server, so a dev rebuild of the live card stays quiet, unless OVERLAY_DISCORD_LOCAL=1 says otherwise. */
export const discordConfigured = () => Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID) && (!/localhost|127\.0\.0\.1/.test(SITE) || process.env.OVERLAY_DISCORD_LOCAL === "1");
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
  const { data } = await supabaseAdmin().from("discord_posts").select("kind").eq("date", date).eq("kind", kind).maybeSingle();
  if (data) return false;
  await remember(date, kind, post);
  return true;
}

/** Posts, and writes the kind down so it is not posted again. */
async function remember(date: string, kind: string, post: () => Promise<string | undefined>): Promise<void> {
  const messageId = await post();
  const { error } = await supabaseAdmin().from("discord_posts").insert({ date, kind, message_id: messageId ?? null });
  if (error) console.error("[discord]", kind, error.message);
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

const isPrime = (c: Call) => Boolean(c.x.prime || c.tag === "prime_overlay" || c.tag === "top_overlay");

/**
 * One call as a line: track and race, then the runner, then the call. The
 * square is the site's colour convention, lime for a Prime, blue for a bet,
 * red for a lay.
 */
function line(c: Call, withTrack = false): string {
  const prime = isPrime(c);
  const square = c.x.signal === "lay" ? "🟥" : prime ? "🟩" : isRoughie(c.x) ? "🔷" : "🟦";
  const side = c.x.signal === "lay" ? "Lay" : prime ? "Prime" : isRoughie(c.x) ? "Way Overlay" : "Bet";
  const limit = callLimit(c.x);
  const strict = limit ? (c.x.signal === "lay" ? `, lay at ${price(limit)} or under` : `, take ${price(limit)} or better`) : "";
  const stake = isRoughie(c.x) ? `, ${stakeOf(c.x)}u` : "";
  return `${square} ${withTrack ? `${c.m.track} ` : ""}R${c.r.raceNumber} ${clock(c.r.jumpTime)}  **${c.x.tabNumber}. ${c.x.horseName}**  ${side} ${price(callPrice(c.x)!)}, rated ${price(c.x.ratedPrice)}${strict}${stake}`;
}

/** Every call, a heading per meeting and a blank line between meetings, races in jump order. */
function lines(calls: Call[]): string {
  const groups = new Map<string, Call[]>();
  for (const c of calls) groups.set(c.m.track, [...(groups.get(c.m.track) ?? []), c]);
  return [...groups.entries()].map(([track, list]) => `**${track.toUpperCase()}**\n${list.map((c) => line(c)).join("\n")}`).join("\n\n");
}

const LAYS_LATER = "Lays post here half an hour before the jump, at the exchange price then.";

/**
 * The morning posts: the Primes, every bet, and the free race. Each goes
 * once per date, so a rebuild never repeats them. A lay is struck on the
 * exchange price at the time, so lays wait for the last half hour before
 * the jump and go from postCallChanges().
 */
export async function postCalls(date: string, card: StoredCard, opts: { early?: boolean } = {}): Promise<void> {
  if (!discordConfigured()) return;
  const calls = callsOn(card);
  const bets = calls.filter((c) => c.x.signal === "back");
  const day = longDate(date);
  try {
    if (opts.early) {
      // Tomorrow's bets the night before, for members only.
      const body = bets.length ? lines(bets) : "No bets on the card yet.";
      await once(date, "early", () => send(CHANNELS.early, `**Early look, ${day}.** Prices will move by morning, the calls may too.\n\n${body}`));
      return;
    }
    if (calls.length === 0) return;
    const primes = bets.filter(isPrime);
    if (primes.length) await once(date, "primes", () => send(CHANNELS.primes, `**Prime Overlays, ${day}**\n${primes.map((c) => line(c, true)).join("\n")}`));
    const body = bets.length ? `**${day}: ${bets.length} ${bets.length === 1 ? "bet" : "bets"}.** ${LAYS_LATER}\n\n${lines(bets)}` : `**${day}: no bets this morning.** ${LAYS_LATER}`;
    await once(date, "calls", () => send(CHANNELS.calls, `${body}\n\n${SITE}/`));
    const free = card.meetings.flatMap((m) => m.races.map((r) => ({ m, r }))).find(({ r }) => r.raceId === card.freeRaceId);
    if (free) await once(date, "free", () => send(CHANNELS.free, freeRacePost(date, day, free.m, free.r, calls)));
  } catch (err) {
    console.error("[discord] calls", err);
  }
}

/**
 * The free race written up: what the race is, how it should be run, our
 * top four with the reason for each, the question the race turns on, and
 * the calls in it, so the post reads like the page rather than a pointer to it.
 */
function freeRacePost(date: string, day: string, m: PublishedMeeting, r: PublishedRace, calls: Call[]): string {
  const live = r.runners.filter((x) => !x.scratched);
  const top = live.filter((x) => x.rank).sort((a, b) => a.rank! - b.rank!);
  const tempo = r.pace.tempo === "fast" ? "A fast tempo" : r.pace.tempo === "slow" ? "A slow tempo" : "An even tempo";
  const lead = r.pace.leaderGap !== undefined && r.pace.leaderGap < 1 ? "a contested lead" : r.pace.leaderGap !== undefined && r.pace.leaderGap >= 3 ? "one horse on its own in front" : "no fight for the lead";
  const leader = live.find((x) => x.ratings.map === "leader");
  const shape = `${tempo} on our read of the early sectionals, with ${lead}${leader ? `, ${leader.horseName} the likely leader` : ""}.`;
  const four = top.map((x) => `${x.rank}. **${x.tabNumber}. ${x.horseName}** rates ${x.ratings.today.toFixed(0)}, ${price(x.ratedPrice)} against ${price(x.marketPrice)}${x.why ? `. ${x.why}` : ""}`).join("\n");
  const own = calls.filter((c) => c.r.raceId === r.raceId);
  const bets = own.filter((c) => c.x.signal === "back");
  const called = [
    ...(bets.length ? bets.map((c) => line(c)) : own.length ? [] : ["No bet in this race: the market has it about right."]),
    ...(own.length > bets.length ? [`A lay in this race. ${LAYS_LATER}`] : []),
  ].join("\n");
  return [
    `**Free race of the day, ${day}**`,
    `${m.track} R${r.raceNumber}, ${r.name}${r.className ? ` (${r.className})` : ""}, ${r.distance}m${r.goingText ? `, ${r.goingText}` : ""}, ${live.length} runners, jumps ${clock(r.jumpTime)}.`,
    ``,
    `**The shape.** ${shape}`,
    ``,
    `**Our top four.**`,
    four,
    ``,
    `**The question.** ${r.verdict}`,
    ``,
    `**The calls.**`,
    called,
    ``,
    `Every runner rated, the sectionals and the speed map: ${raceUrl(date, m, r)}`,
  ].join("\n");
}

/**
 * Calls posted as they happen once the early look or the morning post has
 * gone, so a member who is not on the site hears about them. A bet that
 * appeared since the last card is news; a lay is posted once its race is
 * inside the last half hour before the jump, each once, since that is the
 * price it is struck at. A call that went is not announced, a race that
 * has jumped is left alone, and a call that only changed price is not news.
 */
export async function postCallChanges(date: string, before: Map<string, PublishedRace>, card: StoredCard): Promise<void> {
  if (!discordConfigured() || before.size === 0) return;
  try {
    // Changes follow a post members have seen: the morning calls, or the early look the night before.
    const { data: posts } = await supabaseAdmin().from("discord_posts").select("kind, message_id").eq("date", date);
    if (!posts?.some((p) => (p.kind === "calls" || p.kind === "early") && p.message_id)) return;
    const posted = new Set(posts.map((p) => String(p.kind)));
    const now = Date.now();
    const fresh: Call[] = [];
    const lays: Call[] = [];
    const primes: Call[] = [];
    for (const c of callsOn(card)) {
      if (c.r.result || (c.r.jumpTime && new Date(c.r.jumpTime).getTime() < now)) continue;
      if (c.x.signal === "lay") {
        if (inCallLock(c.r.jumpTime, now) && !posted.has(layKey(c))) lays.push(c);
        continue;
      }
      const prev = before.get(c.r.raceId)?.runners.find((x) => x.tabNumber === c.x.tabNumber);
      // A bet that grew into a Prime during the day goes to the Primes channel as the morning ones did.
      if (isPrime(c) && !prev?.prime && !posted.has(primeKey(c))) primes.push(c);
      if (prev && prev.signal === c.x.signal) continue;
      fresh.push(c);
    }
    for (const c of fresh) await send(CHANNELS.calls, callPost(c, date));
    for (const c of primes) await remember(date, primeKey(c), () => send(CHANNELS.primes, callPost(c, date)));
    for (const c of lays) await remember(date, layKey(c), () => send(CHANNELS.calls, callPost(c, date)));
  } catch (err) {
    console.error("[discord] call changes", err);
  }
}

/**
 * One call on its own, headed by the race and its jump time so the post
 * reads "Ballarat R2 1:30pm, LAY 9. Miss Graff", then the price it is
 * struck at and ours. The heading links to the race page.
 */
function callPost(c: Call, date: string): string {
  const prime = isPrime(c);
  const side = c.x.signal === "lay" ? "LAY" : prime ? "PRIME" : isRoughie(c.x) ? "WAY OVERLAY" : "BET";
  const square = c.x.signal === "lay" ? "🟥" : prime ? "🟩" : isRoughie(c.x) ? "🔷" : "🟦";
  const limit = callLimit(c.x);
  const strict = limit ? (c.x.signal === "lay" ? `, lay at ${price(limit)} or under` : `, take ${price(limit)} or better`) : "";
  const stake = isRoughie(c.x) ? `, ${stakeOf(c.x)}u` : "";
  // The heading is the link to the race; embeds are off on every post, so it stays one line.
  return [`**[${c.m.track} R${c.r.raceNumber} ${clock(c.r.jumpTime)}, ${side} ${c.x.tabNumber}. ${c.x.horseName}](${raceUrl(date, c.m, c.r)})**`, `${square} ${price(callPrice(c.x)!)}, rated ${price(c.x.ratedPrice)}${strict}${stake}`].join("\n");
}

/** The discord_posts kinds that remember a lay, or a Prime made during the day, has been posted. */
const layKey = (c: Call) => `lay:${c.r.raceId}:${c.x.tabNumber}`;
const primeKey = (c: Call) => `prime:${c.r.raceId}:${c.x.tabNumber}`;

/**
 * Winners as they land: every resulted race with a call in it that has not
 * been announced yet posts the calls that came off, a bet that won at its
 * price or a lay that held, with the day's running total. Each race is
 * remembered in discord_posts, so a build cut short after settling the
 * ledger (the prices cron has a time cap) is picked up by the next one
 * rather than lost. Losers stay off this channel; the results post at the
 * end of the day carries the lot.
 */
export async function postWinners(date: string, before: Map<string, PublishedRace>, card: StoredCard): Promise<void> {
  if (!discordConfigured() || before.size === 0) return;
  try {
    const resulted = callsOn(card).filter((c) => c.r.result?.length && c.x.finishPosition !== undefined);
    const raceIds = [...new Set(resulted.map((c) => c.r.raceId))];
    if (raceIds.length === 0) return;
    const { data: posts } = await supabaseAdmin().from("discord_posts").select("kind").eq("date", date).in("kind", raceIds.map((id) => `won:${id}`));
    const announced = new Set((posts ?? []).map((p) => String(p.kind)));
    const landed = resulted.filter((c) => !announced.has(`won:${c.r.raceId}`));
    const won = landed.filter((c) => (c.x.signal === "back" ? c.x.finishPosition === 1 : c.x.finishPosition !== 1));
    // Every race in this batch is written down, winners in it or not, so a race of losers is not asked about again.
    const remember = async (messageId?: string) => {
      const rows = [...new Set(landed.map((c) => c.r.raceId))].map((id) => ({ date, kind: `won:${id}`, message_id: messageId ?? null }));
      if (rows.length) await supabaseAdmin().from("discord_posts").upsert(rows, { onConflict: "date,kind" });
    };
    if (won.length === 0) {
      await remember();
      return;
    }
    // The day so far, over every call in a race that has run.
    let units = 0;
    for (const c of callsOn(card)) {
      if (!c.r.result?.length || c.x.finishPosition === undefined || !callPrice(c.x)!) continue;
      const w = c.x.finishPosition === 1;
      const at = settledAt(c.x.signal!, callPrice(c.x)!, c.r.placings?.find((p) => p.tabNumber === c.x.tabNumber)?.bsp);
      units += (c.x.signal === "back" ? (w ? at - 1 : -1) : w ? -(at - 1) : 1) * stakeOf(c.x);
    }
    const lines = won.map((c) => {
      const prime = isPrime(c);
      if (c.x.signal === "back") {
        const at = settledAt("back", callPrice(c.x)!, c.r.placings?.find((p) => p.tabNumber === c.x.tabNumber)?.bsp);
        return `🏆 **${c.x.horseName}** won ${c.m.track} R${c.r.raceNumber} at ${price(at)}${prime ? ", a Prime" : isRoughie(c.x) ? ", a Way Overlay" : ""}. +${((at - 1) * stakeOf(c.x)).toFixed(2)}u`;
      }
      return `✅ Lay held: **${c.x.horseName}** ran ${ran(c)} in ${c.m.track} R${c.r.raceNumber}, laid at ${price(callPrice(c.x)!)}. +1.00u`;
    });
    const messageId = await send(CHANNELS.winners, [...lines, `Day so far ${units >= 0 ? "+" : ""}${units.toFixed(2)}u, level stakes. ${SITE}/tips`].join("\n"));
    await remember(messageId);
  } catch (err) {
    console.error("[discord] winners", err);
  }
}

const ordinal = (n: number) => (n === 0 ? "last" : `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`);
/** Where a runner finished; behind the placings on BetWatch's result, which names only the placed, it is unplaced until the official one lands. */
const ran = (c: Call) => (c.x.finishPosition! > (c.r.placings?.length ?? 4) && c.r.placings?.every((p) => p.margin === undefined) ? "unplaced" : ordinal(c.x.finishPosition!));

/**
 * A tipster's call, the moment it is saved on the site, so their followers
 * on Discord get it without the tipster posting twice. A call edited
 * before the jump posts again as an update.
 */
export async function postTipsterCall(tipster: { name: string; code: string }, tip: { track: string; race_number: number; tab_number: number; horse_name: string; side: "back" | "lay"; price: number; bookie_price?: number | null; comment: string | null; bookie: string | null }, opts: { date: string; meetingId: string; raceId: string; jumpTime?: string; update?: boolean }): Promise<void> {
  if (!discordConfigured()) return;
  try {
    const square = tip.side === "lay" ? "🟥" : "🟦";
    const side = tip.side === "lay" ? "Lay" : "Bet";
    const head = `${square} **${tipster.name}**${opts.update ? " (updated)" : ""}: ${tip.track} R${tip.race_number} ${clock(opts.jumpTime)}  **${tip.tab_number}. ${tip.horse_name}**  ${side} ${price(tip.bookie_price && tip.bookie_price > 1 ? tip.bookie_price : tip.price)}${tip.bookie ? ` at ${tip.bookie}` : ""}`;
    const body = [head, ...(tip.comment ? [`> ${tip.comment}`] : []), `${SITE}/t/${tipster.code}`];
    await send(CHANNELS.tipsters, body.join("\n"));
  } catch (err) {
    console.error("[discord] tipster call", err);
  }
}

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
        const p = callPrice(c.x)! ?? 0;
        return (c.x.signal === "back" ? (won ? p - 1 : -1) : won ? -(p - 1) : 1) * stakeOf(c.x);
      };
      const rows = calls.map((c) => ({ c, units: settle(c) }));
      const total = rows.reduce((a, r) => a + r.units, 0);
      const bets = rows.filter((r) => r.c.x.signal === "back");
      const lays = rows.filter((r) => r.c.x.signal === "lay");
      const sum = (xs: typeof rows) => xs.reduce((a, r) => a + r.units, 0);
      const fmt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}u`;
      const finish = (c: Call) => (c.x.finishPosition === 1 ? "won" : c.x.finishPosition === 0 ? "did not finish" : ran(c));
      const body = rows.map(({ c, units }) => `${units > 0 ? "✅" : "❌"} ${c.m.track} R${c.r.raceNumber} **${c.x.tabNumber}. ${c.x.horseName}** ${c.x.signal === "lay" ? "Lay" : isRoughie(c.x) ? "Way Overlay" : "Bet"} ${price(callPrice(c.x)!)}, ${finish(c)}, ${fmt(units)}`).join("\n");
      return send(
        CHANNELS.results,
        `**${longDate(date)}: ${fmt(total)}** level stakes, one unit a call and a tenth on a Way Overlay.\nBets ${bets.filter((r) => r.units > 0).length} of ${bets.length} won, ${fmt(sum(bets))}. Lays ${lays.filter((r) => r.units > 0).length} of ${lays.length} landed, ${fmt(sum(lays))}.\n\n${body}\n\nThe record: ${SITE}/#record`,
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
 * the access token from linking) and gives or takes the Member role, and
 * the Tipster role for a tipster account.
 */
async function applyRole(discordId: string, member: boolean, accessToken?: string, tipster = false): Promise<void> {
  const ids = await roles();
  const memberId = ids.get(MEMBER_ROLE);
  if (!memberId) throw new Error("No Member role on the server.");
  const tipsterId = ids.get(TIPSTER_ROLE);
  const base = `/guilds/${guild()}/members/${discordId}`;
  if (accessToken) {
    // Joins them, or is a no-op when they are in already.
    const give = [...(member ? [memberId] : []), ...(tipster && tipsterId ? [tipsterId] : [])];
    await api("PUT", base, { access_token: accessToken, ...(give.length ? { roles: give } : {}) });
  }
  const wanted: [string, boolean][] = [[memberId, member], ...(tipsterId ? [[tipsterId, tipster] as [string, boolean]] : [])];
  for (const [roleId, on] of wanted) {
    try {
      await api(on ? "PUT" : "DELETE", `${base}/roles/${roleId}`);
    } catch (err) {
      // Not in the server: nothing to give the role to.
      if (!/404/.test(String(err))) throw err;
    }
  }
}

export interface DiscordPresence {
  /** In the server right now. */
  joined: boolean;
  /** Holds the Member role. */
  member: boolean;
  tipster: boolean;
  /** Their name on the server. */
  name?: string;
}

/**
 * For the admin: whether each linked Discord account is in the server and
 * which roles it holds, one lookup each, and how big the server is. A
 * lookup that fails reads as not joined.
 */
export async function discordRoster(discordIds: string[]): Promise<{ presence: Map<string, DiscordPresence>; serverMembers?: number }> {
  const presence = new Map<string, DiscordPresence>();
  if (!discordConfigured()) return { presence };
  let serverMembers: number | undefined;
  try {
    const ids = await roles();
    const memberId = ids.get(MEMBER_ROLE);
    const tipsterId = ids.get(TIPSTER_ROLE);
    const g = await api<{ approximate_member_count?: number }>("GET", `/guilds/${guild()}?with_counts=true`);
    serverMembers = g.approximate_member_count;
    for (const id of discordIds) {
      try {
        const m = await api<{ roles: string[]; nick?: string | null; user?: { username: string; global_name?: string | null } }>("GET", `/guilds/${guild()}/members/${id}`);
        presence.set(id, { joined: true, member: Boolean(memberId && m.roles.includes(memberId)), tipster: Boolean(tipsterId && m.roles.includes(tipsterId)), name: m.nick || m.user?.global_name || m.user?.username });
      } catch (err) {
        if (!/404/.test(String(err))) throw err;
        presence.set(id, { joined: false, member: false, tipster: false });
      }
    }
  } catch (err) {
    console.error("[discord] roster", err);
  }
  return { presence, serverMembers };
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
    await applyRole(p.discord_id, memberNow(p as MemberRow, Boolean(aff)), accessToken, Boolean(aff));
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
    const tipster = tipsters.has(p.id);
    const member = memberNow(p, tipster);
    if (member) members++;
    try {
      await applyRole(p.discord_id!, member, undefined, tipster);
    } catch (err) {
      console.error("[discord] sweep", p.id, err);
    }
  }
  return { linked: rows?.length ?? 0, members };
}
