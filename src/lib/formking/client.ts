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
  // The day's meeting list, a credit each time: hourly is soon enough to see a meeting finish.
  meetings: 60 * 60_000,
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
      signal: AbortSignal.timeout(25_000),
    });
    // A cache that does not answer is not a miss: buying the day again on
    // every failed read is what an outage must never turn into.
    if (!res.ok) throw new FormKingError(`fk_cache read failed: ${res.status}`, res.status);
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
  opts: { ttlMs?: number; accept?: (data: T) => boolean; cacheOnly?: boolean } = {},
): Promise<T> {
  if (!cacheOn()) return load();
  const ttl = opts.ttlMs ?? CACHE_TTL_MS[kind] ?? 600_000;
  const hit = await readEntry<T>(kind, key);
  // Cache only: whatever is held, however old, and never a call. The price cron builds this way.
  if (opts.cacheOnly) {
    if (hit) return hit.data;
    throw new FormKingError(`Not cached, and this build makes no Form King calls (${kind}:${key}).`, 404);
  }
  if (hit && Date.now() - hit.at < ttl && (!opts.accept || opts.accept(hit.data))) return hit.data;
  const data = await load();
  await writeEntry(kind, key, data);
  return data;
}

/**
 * The day's spend, counted on every call in the fk_cache row spend:<Sydney
 * date>. Past FORMKING_WARN_CREDITS the admins get one email; past
 * FORMKING_DAILY_CREDITS every call is refused for the rest of the day, and
 * one more email says so. Old race pages rebuilt whole past days from Form
 * King and ran the month's credits out on 30 Sep 2026; the cap keeps any
 * leak like that to one day's worth. Counted on Vercel only, where the site
 * runs; local scripts are metered by whoever runs them.
 */
const DAILY_CREDITS = Number(process.env.FORMKING_DAILY_CREDITS ?? 1500);
const WARN_CREDITS = Number(process.env.FORMKING_WARN_CREDITS ?? 600);

interface Spend {
  credits: number;
  calls: number;
  warned?: boolean;
  capped?: boolean;
}

const spendKey = () => `spend:${new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" })}`;

async function readSpend(): Promise<Spend> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fk_cache?select=data&key=eq.${encodeURIComponent(spendKey())}`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  // A meter that cannot be read refuses the call: spending blind is how the credits went.
  if (!res.ok) throw new FormKingError(`Form King spend meter unreadable: ${res.status}`, 503);
  const rows = (await res.json()) as { data: Spend }[];
  return rows[0]?.data ?? { credits: 0, calls: 0 };
}

async function writeSpend(spend: Spend): Promise<void> {
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fk_cache`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key: spendKey(), kind: "spend", data: spend, at: new Date().toISOString() }),
  }).catch(() => undefined);
}

async function alertAdmins(subject: string, line: string): Promise<void> {
  try {
    const { sendEmail } = await import("@/lib/email/send");
    const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const to of admins) {
      await sendEmail(to, {
        subject,
        preheader: line,
        heading: subject,
        paragraphs: [line, "Look at which pages or jobs are calling Form King before raising FORMKING_DAILY_CREDITS in Vercel."],
      });
    }
  } catch (err) {
    console.error("[formking] alert failed", err);
  }
}

// One meter update at a time in this instance, so calls in flight together do not overwrite each other's count.
let metering: Promise<unknown> = Promise.resolve();

/** Refuses the call when it would take the day past the cap. */
async function checkSpend(cost: number): Promise<void> {
  if (!dbCache()) return;
  const spend = await readSpend();
  if (spend.credits + cost <= DAILY_CREDITS) return;
  if (!spend.capped) {
    await writeSpend({ ...spend, capped: true });
    await alertAdmins("Form King stopped for today", `The site has spent ${spend.credits} Form King credits today, the daily cap of ${DAILY_CREDITS}, and will make no more calls until midnight. The stored card keeps showing.`);
  }
  throw new FormKingError(`Form King daily cap of ${DAILY_CREDITS} credits reached.`, 402);
}

/** Adds a call that went through to the day's spend, and warns once past the warning line. */
function recordSpend(cost: number): Promise<unknown> {
  if (!dbCache()) return Promise.resolve();
  metering = metering.then(async () => {
    const spend = await readSpend().catch(() => undefined);
    if (!spend) return;
    const next: Spend = { ...spend, credits: spend.credits + cost, calls: spend.calls + 1 };
    const warn = !spend.warned && next.credits >= WARN_CREDITS;
    if (warn) next.warned = true;
    await writeSpend(next);
    if (warn) await alertAdmins("Form King spend is high today", `The site has spent ${next.credits} Form King credits today over ${next.calls} calls. It stops at ${DAILY_CREDITS}.`);
  });
  return metering;
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
  /** What the call costs in credits, for the daily meter. */
  cost = 1,
): Promise<T> {
  const apiKey = process.env.FORMKING_API_KEY;
  if (!apiKey) {
    throw new FormKingError(
      "FORMKING_API_KEY is not set. Use the fixtures in src/lib/formking/fixtures.ts for local development.",
      401,
    );
  }
  await checkSpend(cost);

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

  await recordSpend(cost);
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
export function getMeetingsByDate(date: string | Date, states?: string[], opts: { cacheOnly?: boolean } = {}) {
  const ddmmyy = toDdmmyy(date);
  return cached(
    "meetings",
    `${ddmmyy}:${states?.join(",")}`,
    () => request<MeetingSummaryLite[]>(`/b2c/meetings/date/${ddmmyy}`, { states: states?.join(",") }),
    { cacheOnly: opts.cacheOnly },
  );
}

/** Full meeting with fields and the last 12 runs per horse, no benchmarks. 5 credits. */
export function getMeeting(meetingId: string, opts: { ttlMs?: number; accept?: (m: MeetingSummary) => boolean; cacheOnly?: boolean } = {}) {
  return cached("meeting", meetingId, () => request<MeetingSummary>(`/b2c/meetings/${meetingId}`, {}, 5), opts);
}

/** Full race form with sectional benchmarks. 2 credits at five benchmarks. */
export function getRace(
  meetingId: string,
  raceId: string,
  opts: { numBenchmarks?: number; numPastRaces?: number; includeScratchings?: boolean; ttlMs?: number; accept?: (r: RaceSummary) => boolean; cacheOnly?: boolean } = {},
) {
  return cached(
    "race",
    `${meetingId}/${raceId}`,
    () =>
      request<RaceSummary>(
        `/b2c/meetings/${meetingId}/races/${raceId}`,
        {
          racesOnly: true,
          numBenchmarks: opts.numBenchmarks ?? 5,
          numPastRaces: opts.numPastRaces ?? 8,
          includeScratchings: opts.includeScratchings ?? false,
        },
        2 + Math.max(0, (opts.numBenchmarks ?? 5) - 5) * 0.5,
      ),
    { ttlMs: opts.ttlMs, accept: opts.accept, cacheOnly: opts.cacheOnly },
  );
}

/** Form King's default speed map for one race. 1 credit. */
export function getSpeedmap(meetingId: string, raceId: string) {
  return request<Speedmap>(`/b2c/meetings/${meetingId}/speedmaps/${raceId}`);
}

/** Every speed map at a meeting. 5 credits. */
export function getMeetingSpeedmaps(meetingId: string, opts: { cacheOnly?: boolean } = {}) {
  return cached("speedmap", meetingId, () => request<Speedmap[]>(`/b2c/meetings/${meetingId}/speedmaps`, {}, 5), opts);
}

/**
 * A horse's career with benchmarks, by breeding id. 2 credits at five
 * benchmarks. Not cached: the review stores what it needs.
 */
export function getHorse(horseId: string, opts: { numPastRaces?: number; numBenchmarks?: number } = {}) {
  return request<HorseForm>(
    `/b2c/horses/${encodeURIComponent(horseId)}`,
    {
      racesOnly: true,
      numPastRaces: opts.numPastRaces ?? 3,
      numBenchmarks: opts.numBenchmarks ?? 3,
    },
    2,
  );
}

/** Form King dates are DDMMYY. */
function toDdmmyy(date: string | Date): string {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}${pad(d.getMonth() + 1)}${String(d.getFullYear()).slice(-2)}`;
}
