import "server-only";
import { cacheLife } from "next/cache";

import { fixtureMeetings, type FixtureMeeting } from "@/lib/formking/fixtures";
import {
  getMeetingsByDate,
  getMeetingSpeedmaps,
  getRace,
} from "@/lib/formking/client";
import type { MeetingSummary, RaceSummary, Speedmap } from "@/lib/formking/types";
import { pickFreeRace, publishMeeting, selectBestBets } from "./publish";
import type { PublishedMeeting, Selection } from "./types";

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

/**
 * Today's card.
 *
 * Split in two on purpose: this wrapper revalidates often so the date rolls
 * over promptly after midnight, while getCard() underneath stays cached for an
 * hour so a rollover costs no extra Form King credits.
 */
export async function getTodayCard(): Promise<
  Awaited<ReturnType<typeof getCard>> & { date: string }
> {
  "use cache";
  cacheLife("minutes");

  const date = racingToday();
  return { date, ...(await getCard(date)) };
}

export async function getCard(date: string): Promise<{
  meetings: PublishedMeeting[];
  selections: Selection[];
  freeRaceId?: string;
  live: boolean;
}> {
  "use cache";
  // Fields and prices move during the morning; an hour is a fair compromise
  // between freshness and credit spend.
  cacheLife("hours");

  const raw = usingLiveData() ? await loadLive(date) : fixtureMeetings(date);
  const meetings = raw
    .map(({ meeting, races, speedmaps }) => publishMeeting(meeting, races, speedmaps))
    .sort((a, b) => a.track.localeCompare(b.track));

  const selections = selectBestBets(meetings);

  return { meetings, selections, freeRaceId: pickFreeRace(meetings), live: usingLiveData() };
}

export async function getMeetingCard(
  date: string,
  meetingId: string,
): Promise<PublishedMeeting | undefined> {
  const { meetings } = await getCard(date);
  return meetings.find((m) => m.meetingId === meetingId);
}

export async function getRaceCard(date: string, meetingId: string, raceId: string) {
  const { meetings, selections, freeRaceId } = await getCard(date);
  const meeting = meetings.find((m) => m.meetingId === meetingId);
  const race = meeting?.races.find((r) => r.raceId === raceId);
  if (!meeting || !race) return undefined;
  return {
    meeting,
    race,
    meetings,
    selections,
    free: race.raceId === freeRaceId,
  };
}

async function loadLive(date: string): Promise<FixtureMeeting[]> {
  const index = await getMeetingsByDate(date, STATES);

  // Sequential on purpose: the client throttles to stay inside 300 req / 300 s,
  // and a Saturday metro card is a lot of races. The race endpoint carries the
  // fields and benchmarks we need, so the 5-credit meeting call is skipped.
  const out: FixtureMeeting[] = [];
  for (const lite of index) {
    if (lite.tabMeeting === false) continue;
    const races: RaceSummary[] = [];
    for (const r of lite.races ?? []) {
      if (r.raceType && r.raceType !== "Flat") continue;
      races.push(await getRace(lite.id, r.raceId));
    }
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
 * Only ever called inside a cache scope; see getTodayCard().
 */
function racingToday(): string {
  const now = new Date();
  const syd = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
  return `${syd.getFullYear()}-${pad(syd.getMonth() + 1)}-${pad(syd.getDate())}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
