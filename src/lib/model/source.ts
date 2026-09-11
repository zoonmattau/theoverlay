import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { after } from "next/server";

import { fixtureMeetings, type FixtureMeeting } from "@/lib/formking/fixtures";
import {
  getMeetingsByDate,
  getMeetingSpeedmaps,
  getRace,
} from "@/lib/formking/client";
import type { MeetingSummary, RaceSummary, Speedmap } from "@/lib/formking/types";
import { pickFreeRace, publishMeeting, selectBestBets } from "./publish";
import { claimRefresh, readStoredCard, storeConfigured, writeStoredCard, type StoredCard } from "./store";
import type { PublishedMeeting } from "./types";

/**
 * The app's only data entry point.
 *
 * Loads from Form King (or fixtures, when no key is configured), runs the
 * model, and returns published types. Nothing outside src/lib/model may import
 * from src/lib/formking, see the licence guard in eslint.config.mjs.
 */

export const usingLiveData = () => Boolean(process.env.FORMKING_API_KEY);

/** Which states we cover. Filtering here is the main lever on credit spend. */
const STATES = (process.env.OVERLAY_STATES ?? "NSW,VIC,QLD").split(",");

/** Speed maps cost five credits a meeting, so they are opt-in. */
const WANT_SPEEDMAPS = process.env.OVERLAY_SPEEDMAPS === "1";

/** How old a stored card can be before a page view asks for a rebuild. */
const STALE_MS = Number(process.env.OVERLAY_STALE_MIN ?? 10) * 60_000;

/**
 * What a race refresh costs is two credits, so each race is re-bought only
 * when it is due: every hour while it is a long way off, every ten minutes
 * from 45 minutes before the jump until the result is in, then never.
 */
const FAR_TTL_MS = 60 * 60_000;
const NEAR_TTL_MS = Number(process.env.OVERLAY_NEAR_MIN ?? 10) * 60_000;
const NEAR_WINDOW_MS = 45 * 60_000;
const DONE_TTL_MS = 24 * 60 * 60_000;

const hasResult = (r: RaceSummary) => r.entries.some((e) => e.horseResult && e.horseResult.finishPosition > 0);

function raceTtl(lite: { status?: string; startTime?: string }, meetingDate: number | undefined): { ttlMs: number; accept?: (r: RaceSummary) => boolean } {
  const resulted = /result|final|paid|abandon/i.test(lite.status ?? "");
  if (resulted) return { ttlMs: DONE_TTL_MS, accept: hasResult };
  const jump = jumpMillis(meetingDate, lite.startTime);
  if (jump === undefined) return { ttlMs: NEAR_TTL_MS };
  const until = jump - Date.now();
  return { ttlMs: until > NEAR_WINDOW_MS ? FAR_TTL_MS : NEAR_TTL_MS };
}

/** "12:35pm" on the meeting date, Sydney time, as epoch millis. */
function jumpMillis(meetingDate: number | undefined, startTime?: string): number | undefined {
  const m = startTime?.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m || !meetingDate) return undefined;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  const day = new Date(meetingDate).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const offset = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", timeZoneName: "longOffset" })
    .formatToParts(new Date(meetingDate))
    .find((p) => p.type === "timeZoneName")?.value.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? "+10:00";
  return new Date(`${day}T${String(h).padStart(2, "0")}:${m[2]}:00${offset}`).getTime();
}

/** Tips go live at this hour, Sydney time, on the racing date. */
export const RELEASE_HOUR = Number(process.env.OVERLAY_RELEASE_HOUR ?? 8);

/** Whether the calls for a date are public yet. */
export function released(date: string): boolean {
  const today = racingToday();
  if (date < today) return true;
  if (date > today) return false;
  return sydneyHour() >= RELEASE_HOUR;
}

/** The card with every call removed, for the hours before release. */
function withheld(card: Card): Card {
  return {
    ...card,
    released: false,
    selections: [],
    meetings: card.meetings.map((m) => ({
      ...m,
      races: m.races.map((r) => ({
        ...r,
        verdict: "",
        runners: r.runners.map((x) => ({ ...x, signal: undefined, rank: null, why: undefined })),
      })),
    })),
  };
}

/**
 * Today's card.
 *
 * Cached briefly so the date rolls over promptly after midnight and every
 * page in a burst shares one store read.
 */
export async function getTodayCard(preview = false): Promise<Awaited<ReturnType<typeof getCard>> & { date: string }> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });

  const date = racingToday();
  return { date, ...(await getCard(date, preview)) };
}

/**
 * A page's card: today's, or for an admin previewing another date, that
 * date's. Non-admins always get today, whatever the query string says.
 */
export async function getCardFor(date: string | undefined, preview: boolean): Promise<Card & { date: string }> {
  if (preview && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return { date, ...(await getCard(date, true)) };
  return getTodayCard(preview);
}

export interface Card extends StoredCard {
  /** ISO, when the card was last built. */
  builtAt: string;
  /** False before RELEASE_HOUR on the racing date: the board is up, the calls are not. */
  released: boolean;
}

/**
 * The card for a date, read from the store. Form King is never called from a
 * page view once a card exists; the morning run and keepFresh() do that.
 * Without a store (local dev, no keys) it builds in place.
 */
export async function getCard(date: string, preview = false): Promise<Card> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(`card-${date}`);

  // Admins preview everything, but still learn whether members can see it.
  const gate = (card: Card) => (preview ? { ...card, released: released(date) } : released(date) ? card : withheld(card));
  if (storeConfigured()) {
    const stored = await readStoredCard(date);
    if (stored) return gate({ ...stored.card, builtAt: stored.builtAt, released: true });
  }
  // No card yet: build it here, once, and let the cache hold it.
  const built = await buildCard(date, { revalidate: false });
  return gate({ ...built.card, builtAt: new Date().toISOString(), released: true });
}

/** Builds the card from Form King (or fixtures) and, with a store, saves it. */
export async function buildCard(date: string, opts: { revalidate?: boolean } = {}): Promise<{ card: StoredCard; seconds: number }> {
  const started = Date.now();
  const raw = usingLiveData() ? await loadLive(date) : fixtureMeetings(date);
  const meetings = raw
    .map(({ meeting, races, speedmaps }) => publishMeeting(meeting, races, speedmaps))
    .sort((a, b) => a.track.localeCompare(b.track));
  const selections = selectBestBets(meetings);
  // Prime Overlays are chosen across the card, so the runner learns it here.
  const primes = new Set(selections.filter((s) => s.tag === "prime_overlay" || s.tag === "top_overlay").map((s) => `${s.raceId}:${s.tabNumber}`));
  for (const m of meetings) for (const r of m.races) for (const x of r.runners) if (primes.has(`${r.raceId}:${x.tabNumber}`)) x.prime = true;
  const card: StoredCard = { meetings, selections, freeRaceId: pickFreeRace(meetings), live: usingLiveData() };
  const seconds = Math.round((Date.now() - started) / 1000);
  if (storeConfigured()) {
    await writeStoredCard(date, card, seconds);
    // Not allowed from inside a cache scope, so the in-cache build skips it.
    if (opts.revalidate !== false) revalidateTag(`card-${date}`, "max");
  }
  return { card, seconds };
}

/**
 * Call from a page after reading a card: when it is older than STALE_MS a
 * rebuild runs after the response has gone out, one at a time across the
 * fleet thanks to the lock in the store.
 */
export function keepFresh(date: string, card: Card): void {
  if (!storeConfigured() || !usingLiveData()) return;
  if (Date.now() - new Date(card.builtAt).getTime() < STALE_MS) return;
  after(async () => {
    if (!(await claimRefresh(date))) return;
    try {
      await buildCard(date);
    } catch (err) {
      console.error("[card] refresh failed", err);
    }
  });
}

export async function getMeetingCard(
  date: string,
  meetingId: string,
): Promise<PublishedMeeting | undefined> {
  const { meetings } = await getCard(date);
  return meetings.find((m) => m.meetingId === meetingId);
}

export async function getRaceCard(date: string, meetingId: string, raceId: string, preview = false) {
  const card = await getCard(date, preview);
  const { meetings, selections, freeRaceId } = card;
  const meeting = meetings.find((m) => m.meetingId === meetingId);
  const race = meeting?.races.find((r) => r.raceId === raceId);
  if (!meeting || !race) return undefined;
  return {
    meeting,
    race,
    meetings,
    selections,
    free: race.raceId === freeRaceId,
    card,
  };
}

async function loadLive(date: string): Promise<FixtureMeeting[]> {
  const index = await getMeetingsByDate(date, STATES);

  // Every race at once; the client caps how many are in flight. The race
  // endpoint carries the fields and benchmarks we need, so the 5-credit
  // meeting call is skipped.
  const wanted = index.filter((lite) => lite.tabMeeting !== false);
  const loaded = await Promise.all(
    wanted.map((lite) =>
      Promise.all(
        (lite.races ?? [])
          .filter((r) => !r.raceType || r.raceType === "Flat")
          .map((r) => getRace(lite.id, r.raceId, raceTtl(r, lite.date))),
      ),
    ),
  );
  const out: FixtureMeeting[] = [];
  for (const [i, lite] of wanted.entries()) {
    const races: RaceSummary[] = loaded[i];
    if (races.length === 0) continue;

    const speedmaps: Record<string, Speedmap> = {};
    if (WANT_SPEEDMAPS) {
      try {
        for (const s of await getMeetingSpeedmaps(lite.id)) speedmaps[s.raceId] = s;
      } catch {
        // Speed maps are a nice-to-have; the model has a fallback.
      }
    }

    const meeting: MeetingSummary = {
      id: lite.id,
      trackName: lite.trackName,
      state: lite.state,
      date: lite.date,
      status: lite.status,
      tabMeeting: lite.tabMeeting,
      railPosition: lite.railPosition,
      updated: Date.now(),
    };
    out.push({ meeting, races, speedmaps });
  }
  return out;
}

/**
 * Today in Australian racing terms, the card rolls at midnight Sydney time.
 * Called inside a cache scope or a request; never during prerender.
 */
export function racingToday(): string {
  const syd = sydneyNow();
  return `${syd.getFullYear()}-${pad(syd.getMonth() + 1)}-${pad(syd.getDate())}`;
}

const sydneyNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
const sydneyHour = () => sydneyNow().getHours() + sydneyNow().getMinutes() / 60;

const pad = (n: number) => String(n).padStart(2, "0");
