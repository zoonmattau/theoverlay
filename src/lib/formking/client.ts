import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  MeetingSummary,
  MeetingSummaryLite,
  RaceSummary,
  Speedmap,
} from "./types";

/**
 * Form King Modellers API client.
 *
 * Server-only. The API key must never reach the browser, and responses from
 * this module must pass through src/lib/model/publish.ts before rendering.
 *
 * Spec: https://github.com/dpfundt/form-king-api-tools (b2c-openapi.yaml).
 * Rate limit: 300 requests per 300 seconds, shared across Web and API.
 * Credits: meetings index 1, meeting 5, race form 2 (+0.5 per benchmark past
 * five), speed map 1 per race or 5 per meeting. Pro tier ships 30k a month.
 */

const BASE_URL = process.env.FORMKING_BASE_URL ?? "https://api.formking.com.au";

export class FormKingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FormKingError";
  }
}

/**
 * Raw responses are kept on disk for a while so a dev-mode navigation, a
 * cache miss or a restart never re-buys a card. Off with FORMKING_CACHE=0.
 */
const CACHE_DIR = path.join(process.cwd(), ".formking-cache");
const CACHE_TTL_MS: Record<string, number> = {
  meetings: 10 * 60_000,
  race: 30 * 60_000,
  speedmap: 30 * 60_000,
};
const cacheOn = () => process.env.FORMKING_CACHE !== "0";

async function cached<T>(kind: string, key: string, load: () => Promise<T>): Promise<T> {
  if (!cacheOn()) return load();
  const file = path.join(CACHE_DIR, `${kind}-${createHash("sha1").update(key).digest("hex")}.json`);
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as { at: number; data: T };
    if (Date.now() - raw.at < (CACHE_TTL_MS[kind] ?? 600_000)) return raw.data;
  } catch {
    // no cache yet
  }
  const data = await load();
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // a read-only filesystem just means no cache
  }
  return data;
}

/**
 * A few calls in flight at once with a short gap between starts. A full day
 * is about 40 requests, well inside 300 req / 300 s, so the limiter is there
 * to stop a burst, not to pace the whole crawl.
 */
const MAX_IN_FLIGHT = 4;
const MIN_REQUEST_GAP_MS = 250;
let lastRequestAt = 0;
let inFlight = 0;
const waiting: (() => void)[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  while (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiting.push(r));
  inFlight++;
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

function release() {
  inFlight--;
  waiting.shift()?.();
}

async function request<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const apiKey = process.env.FORMKING_API_KEY;
  if (!apiKey) {
    throw new FormKingError(
      "FORMKING_API_KEY is not set. Use the fixtures in src/lib/formking/fixtures.ts for local development.",
      401,
    );
  }

  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  await throttle();
  let res: Response;
  try {
    // Large responses come back as a 307 to a pre-signed S3 URL, which fetch
    // follows on its own.
    res = await fetch(url, { headers: { "x-api-key": apiKey }, cache: "no-store" });
    if (res.status === 429) {
      // One polite retry after the window eases.
      await sleep(5_000);
      res = await fetch(url, { headers: { "x-api-key": apiKey }, cache: "no-store" });
    }
  } finally {
    release();
  }

  if (res.status === 402) {
    throw new FormKingError("Form King credits exhausted for this period.", 402);
  }
  if (res.status === 429) {
    throw new FormKingError("Form King rate limit hit (300 req / 300 s).", 429);
  }
  if (!res.ok) {
    throw new FormKingError(
      `Form King request failed: ${res.status} ${res.statusText} (${path})`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

/** Meetings across the next 7 days. 1 credit. */
export function getUpcomingMeetings(opts: {
  states?: string[];
  grades?: string[];
  statuses?: string[];
} = {}) {
  return request<MeetingSummaryLite[]>("/b2c/meetings/upcoming", {
    states: opts.states?.join(","),
    grades: opts.grades?.join(","),
    statuses: opts.statuses?.join(","),
  });
}

/** Meetings for a single date. `date` is a JS Date or ISO yyyy-mm-dd. 1 credit. */
export function getMeetingsByDate(date: string | Date, states?: string[]) {
  const ddmmyy = toDdmmyy(date);
  return cached("meetings", `${ddmmyy}:${states?.join(",")}`, () =>
    request<MeetingSummaryLite[]>(`/b2c/meetings/date/${ddmmyy}`, { states: states?.join(",") }),
  );
}

/** Full meeting with fields and the last 12 runs per horse, no benchmarks. 5 credits. */
export function getMeeting(meetingId: string) {
  return request<MeetingSummary>(`/b2c/meetings/${meetingId}`);
}

/** Full race form with sectional benchmarks. 2 credits at five benchmarks. */
export function getRace(
  meetingId: string,
  raceId: string,
  opts: { numBenchmarks?: number; numPastRaces?: number; includeScratchings?: boolean } = {},
) {
  return cached("race", `${meetingId}/${raceId}`, () =>
    request<RaceSummary>(`/b2c/meetings/${meetingId}/races/${raceId}`, {
      racesOnly: true,
      numBenchmarks: opts.numBenchmarks ?? 5,
      numPastRaces: opts.numPastRaces ?? 8,
      includeScratchings: opts.includeScratchings ?? false,
    }),
  );
}

/** Form King's default speed map for one race. 1 credit. */
export function getSpeedmap(meetingId: string, raceId: string) {
  return request<Speedmap>(`/b2c/meetings/${meetingId}/speedmaps/${raceId}`);
}

/** Every speed map at a meeting. 5 credits. */
export function getMeetingSpeedmaps(meetingId: string) {
  return cached("speedmap", meetingId, () => request<Speedmap[]>(`/b2c/meetings/${meetingId}/speedmaps`));
}

/** Form King dates are DDMMYY. */
function toDdmmyy(date: string | Date): string {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}${pad(d.getMonth() + 1)}${String(d.getFullYear()).slice(-2)}`;
}
