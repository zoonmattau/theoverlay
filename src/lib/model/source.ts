import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { after } from "next/server";

import { fixtureMeetings, type FixtureMeeting } from "@/lib/formking/fixtures";
import {
  getMeeting,
  getMeetingsByDate,
  getMeetingSpeedmaps,
  getRace,
} from "@/lib/formking/client";
import type { MeetingSummary, MeetingSummaryLite, RaceEntry, RaceSummary, Speedmap } from "@/lib/formking/types";
import { pickFreeRace, publishMeeting, selectBestBets, zoneFor, zoneOffset, type KeptSignals } from "./publish";
import { explain } from "./ratings";
import { claimRefresh, readStoredCard, storeConfigured, writeStoredCard, type StoredCard } from "./store";
import { settleCreatorTips } from "@/lib/creators";
import { recordTips } from "@/lib/tips";
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

/** Meetings with the best black-type racing come first: a Group 1 outweighs anything. */
function meetingWeight(m: PublishedMeeting): number {
  return m.races.reduce((w, r) => {
    const g = `${r.className ?? ""} ${r.name}`.match(/group\s?([123])|\bg([123])\b/i);
    const n = g ? Number(g[1] ?? g[2]) : 0;
    return w + (n === 1 ? 100 : n === 2 ? 10 : n === 3 ? 1 : 0);
  }, 0);
}

const firstJump = (m: PublishedMeeting) => m.races.map((r) => r.jumpTime ?? "9").sort()[0] ?? "9";

/** How old a stored card can be before a page view asks for a rebuild. */
const STALE_MS = Number(process.env.OVERLAY_STALE_MIN ?? 20) * 60_000;

/**
 * Credits. Race form (two credits, the benchmarks and full career) is bought
 * once per race per day and never again. What moves during the day, prices,
 * scratchings, going, results, comes from the meeting summary (five credits
 * for the whole meeting), polled every hour while the meeting is a long way
 * off, every fifteen minutes from an hour before its first race until its
 * last result, then never.
 */
const RACE_FORM_TTL_MS = 30 * 60 * 60_000;
const FAR_TTL_MS = 60 * 60_000;
const NEAR_TTL_MS = Number(process.env.OVERLAY_NEAR_MIN ?? 15) * 60_000;
const NEAR_WINDOW_MS = 60 * 60_000;
const DONE_TTL_MS = 24 * 60 * 60_000;

function meetingTtl(lite: MeetingSummaryLite): number {
  const races = (lite.races ?? []).filter((r) => !r.raceType || r.raceType === "Flat");
  if (races.length === 0) return DONE_TTL_MS;
  const allDone = races.every((r) => /result|abandon/i.test(r.status ?? ""));
  if (allDone) return DONE_TTL_MS;
  const jumps = races.map((r) => jumpMillis(lite.date, r.startTime, lite.state)).filter((j): j is number => j !== undefined);
  if (jumps.length === 0) return NEAR_TTL_MS;
  const first = Math.min(...jumps);
  return first - Date.now() > NEAR_WINDOW_MS ? FAR_TTL_MS : NEAR_TTL_MS;
}

/**
 * The race form bought earlier, brought up to date from the meeting summary:
 * prices, scratchings, weights, riders, going and results move; the form and
 * benchmarks do not. A runner only in the summary (a late emergency) comes
 * in as it is.
 */
function mergeLive(form: RaceSummary, live?: RaceSummary): RaceSummary {
  if (!live) return form;
  const fresh = new Map(live.entries.map((e) => [e.number, e]));
  const entries: RaceEntry[] = form.entries.map((e) => {
    const l = fresh.get(e.number);
    if (!l) return e;
    return {
      ...e,
      scratched: l.scratched,
      emergency: l.emergency ?? e.emergency,
      barrier: l.barrier ?? e.barrier,
      jockey: l.jockey ?? e.jockey,
      weight: l.weight ?? e.weight,
      weightCarried: l.weightCarried ?? e.weightCarried,
      apprenticeClaim: l.apprenticeClaim ?? e.apprenticeClaim,
      gear: l.gear ?? e.gear,
      odds: l.odds ?? e.odds,
      horseResult: l.horseResult ?? e.horseResult,
    };
  });
  for (const l of live.entries) if (!form.entries.some((e) => e.number === l.number)) entries.push(l);
  return {
    ...form,
    going: live.going ?? form.going,
    goingNumber: live.goingNumber ?? form.goingNumber,
    status: live.status ?? form.status,
    startTime: live.startTime ?? form.startTime,
    railPosition: live.railPosition ?? form.railPosition,
    entries,
  };
}

/** "12:35pm" on the meeting date, in the track's own time zone, as epoch millis. */
function jumpMillis(meetingDate: number | undefined, startTime?: string, state?: string): number | undefined {
  const m = startTime?.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m || !meetingDate) return undefined;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  const zone = zoneFor(state);
  const day = new Date(meetingDate).toLocaleDateString("en-CA", { timeZone: zone });
  return new Date(`${day}T${String(h).padStart(2, "0")}:${m[2]}:00${zoneOffset(new Date(meetingDate), zone)}`).getTime();
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
  // Calls already on the stored card carry over while they keep half their edge.
  const kept: KeptSignals = new Map();
  let pinnedFreeRaceId: string | undefined;
  let previousFreeRaceId: string | undefined;
  if (storeConfigured()) {
    const previous = await readStoredCard(date);
    pinnedFreeRaceId = previous?.pinnedFreeRaceId;
    previousFreeRaceId = previous?.card.freeRaceId;
    for (const m of previous?.card.meetings ?? []) for (const r of m.races) for (const x of r.runners) if (x.signal) kept.set(`${r.raceId}:${x.tabNumber}`, x.signal);
  }
  const raw = usingLiveData() ? await loadLive(date) : fixtureMeetings(date);
  const meetings = raw
    .map(({ meeting, races, speedmaps }) => publishMeeting(meeting, races, speedmaps, kept))
    .sort((a, b) => meetingWeight(b) - meetingWeight(a) || firstJump(a).localeCompare(firstJump(b)) || a.track.localeCompare(b.track));
  const selections = selectBestBets(meetings);
  // Prime Overlays are chosen across the card, so the runner learns it here.
  const primes = new Set(selections.filter((s) => s.tag === "prime_overlay" || s.tag === "top_overlay").map((s) => `${s.raceId}:${s.tabNumber}`));
  for (const m of meetings) {
    for (const r of m.races) {
      for (const x of r.runners) if (primes.has(`${r.raceId}:${x.tabNumber}`)) x.prime = true;
      // A Prime always sits in the top four: it takes the fourth spot if the
      // ratings alone left it out.
      for (const x of r.runners) {
        if (!x.prime || x.rank) continue;
        const fourth = r.runners.find((y) => y.rank === 4);
        if (fourth) {
          fourth.rank = null;
          fourth.why = undefined;
        }
        x.rank = 4;
        x.why = explain(x.ratings, 4, { going: r.going, tempo: r.pace.tempo }, x.signal);
      }
    }
  }
  const card: StoredCard = { meetings, selections, freeRaceId: pickFreeRace(meetings, pinnedFreeRaceId, previousFreeRaceId), live: usingLiveData() };
  const seconds = Math.round((Date.now() - started) / 1000);
  if (storeConfigured()) {
    await writeStoredCard(date, card, seconds);
    // New calls join the ledger at today's price; run races settle.
    await recordTips(date, card);
    await settleCreatorTips(date, card);
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
    wanted.map(async (lite) => {
      const forms = await Promise.all(
        (lite.races ?? [])
          .filter((r) => !r.raceType || r.raceType === "Flat")
          .map((r) => getRace(lite.id, r.raceId, { ttlMs: RACE_FORM_TTL_MS })),
      );
      if (forms.length === 0) return forms;
      let live: MeetingSummary | undefined;
      try {
        live = await getMeeting(lite.id, { ttlMs: meetingTtl(lite) });
      } catch (err) {
        console.error("[card] meeting summary failed", lite.id, err);
      }
      return forms.map((f) => mergeLive(f, live?.races?.find((x) => x.raceId === f.raceId)));
    }),
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
