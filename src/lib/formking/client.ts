import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  HorseForm,
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
 * Raw responses are cached so a refresh only re-buys what is due: on disk in
 * development, in the fk_cache table on Vercel (its disk is read-only). Each
 * call names its own time to live; a validator can reject a stale shape, for
 * instance a resulted race cached before the result landed. Off with
 * FORMKING_CACHE=0.
 */
const CACHE_DIR = path.join(process.cwd(), ".formking-cache");
const CACHE_TTL_MS: Record<string, number> = {
  meetings: 10 * 60_000,
  race: 30 * 60_000,
  speedmap: 30 * 60_000,
};
const cacheOn = () => process.env.FORMKING_CACHE !== "0";
const dbCache = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.VERCEL);

interface Entry<T> {
  at: number;
  data: T;
}

async function readEntry<T>(kind: string, key: string): Promise<Entry<T> | undefined> {
  if (dbCache()) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fk_cache?select=data,at&key=eq.${encodeURIComponent(`${kind}:${key}`)}`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const rows = (await res.json()) as { data: T; at: string }[];
    return rows[0] ? { at: new Date(rows[0].at).getTime(), data: rows[0].data } : undefined;
  }
  try {
    return JSON.parse(await readFile(path.join(CACHE_DIR, `${kind}-${createHash("sha1").update(key).digest("hex")}.json`), "utf8")) as Entry<T>;
  } catch {
    return undefined;
  }
}

async function writeEntry<T>(kind: string, key: string, data: T): Promise<void> {
  try {
    if (dbCache()) {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fk_cache`, {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({ key: `${kind}:${key}`, kind, data, at: new Date().toISOString() }),
      });
      return;
    }
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, `${kind}-${createHash("sha1").update(key).digest("hex")}.json`), JSON.stringify({ at: Date.now(), data }));
  } catch {
    // no cache is only a cost, never an error
  }
}

async function cached<T>(
  kind: string,
  key: string,
  load: () => Promise<T>,
  opts: { ttlMs?: number; accept?: (data: T) => boolean } = {},
): Promise<T> {
  if (!cacheOn()) return load();
  const ttl = opts.ttlMs ?? CACHE_TTL_MS[kind] ?? 600_000;
  const hit = await readEntry<T>(kind, key);
  if (hit && Date.now() - hit.at < ttl && (!opts.accept || opts.accept(hit.data))) return hit.data;
  const data = await load();
  await writeEntry(kind, key, data);
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
export function getMeeting(meetingId: string, opts: { ttlMs?: number; accept?: (m: MeetingSummary) => boolean } = {}) {
  return cached("meeting", meetingId, () => request<MeetingSummary>(`/b2c/meetings/${meetingId}`), { ttlMs: opts.ttlMs, accept: opts.accept });
}

/** Full race form with sectional benchmarks. 2 credits at five benchmarks. */
export function getRace(
  meetingId: string,
  raceId: string,
  opts: { numBenchmarks?: number; numPastRaces?: number; includeScratchings?: boolean; ttlMs?: number; accept?: (r: RaceSummary) => boolean } = {},
) {
  return cached(
    "race",
    `${meetingId}/${raceId}`,
    () =>
      request<RaceSummary>(`/b2c/meetings/${meetingId}/races/${raceId}`, {
        racesOnly: true,
        numBenchmarks: opts.numBenchmarks ?? 5,
        numPastRaces: opts.numPastRaces ?? 8,
        includeScratchings: opts.includeScratchings ?? false,
      }),
    { ttlMs: opts.ttlMs, accept: opts.accept },
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

/**
 * A horse's career with benchmarks, by breeding id. 2 credits at five
 * benchmarks. Not cached: the review stores what it needs.
 */
export function getHorse(horseId: string, opts: { numPastRaces?: number; numBenchmarks?: number } = {}) {
  return request<HorseForm>(`/b2c/horses/${encodeURIComponent(horseId)}`, {
    racesOnly: true,
    numPastRaces: opts.numPastRaces ?? 3,
    numBenchmarks: opts.numBenchmarks ?? 3,
  });
}

/** Form King dates are DDMMYY. */
function toDdmmyy(date: string | Date): string {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}${pad(d.getMonth() + 1)}${String(d.getFullYear()).slice(-2)}`;
}
