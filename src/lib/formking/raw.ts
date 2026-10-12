import "server-only";

import { gunzipSync, gzipSync } from "node:zlib";

import { supabaseAdmin } from "@/lib/billing/access";

/**
 * Every Form King response we pay for, kept for good (the user, 12 Oct 2026:
 * save it all, never buy the same thing twice). Gzipped JSON in the private
 * Storage bucket formking-raw, one file per API path per Sydney day, the
 * day's last copy winning: horses/<id>/<day>.json.gz,
 * meetings/<meeting>/races/<race>/<day>.json.gz and so on. Storage, not a
 * table: race form runs 250 to 450KB a race, and the database stays lean.
 */
export const RAW_BUCKET = "formking-raw";

const sydneyDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const folderOf = (apiPath: string) => apiPath.replace(/^\/?b2c\//, "").replace(/[^A-Za-z0-9_./-]/g, "_").replace(/\/+$/, "");

let bucketReady: Promise<void> | undefined;
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const s = supabaseAdmin().storage;
    const { data } = await s.getBucket(RAW_BUCKET);
    if (!data) await s.createBucket(RAW_BUCKET, { public: false });
  })().catch((e) => {
    bucketReady = undefined;
    throw e;
  });
  return bucketReady;
}

/** Keeps a response. Never throws: a copy that fails to save must not fail the call that bought it. */
export async function keepRaw(apiPath: string, body: unknown): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await ensureBucket();
    const file = `${folderOf(apiPath)}/${sydneyDay()}.json.gz`;
    const { error } = await supabaseAdmin().storage.from(RAW_BUCKET).upload(file, gzipSync(JSON.stringify(body)), { contentType: "application/gzip", upsert: true });
    if (error) console.error("[raw] keep", file, error.message);
  } catch (e) {
    console.error("[raw] keep", apiPath, e instanceof Error ? e.message : e);
  }
}

/** The kept copies of a path, oldest first, as their days. */
export async function rawDays(apiPath: string): Promise<string[]> {
  const { data } = await supabaseAdmin().storage.from(RAW_BUCKET).list(folderOf(apiPath), { limit: 1000 });
  return (data ?? []).map((f) => f.name.replace(/\.json\.gz$/, "")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
}

/** A kept copy: that day's, or the latest on or before it, or the latest of all. */
export async function readRaw<T>(apiPath: string, day?: string): Promise<T | undefined> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return undefined;
  try {
    const days = await rawDays(apiPath);
    const pick = day ? days.filter((d) => d <= day).pop() : days.pop();
    if (!pick) return undefined;
    const { data } = await supabaseAdmin().storage.from(RAW_BUCKET).download(`${folderOf(apiPath)}/${pick}.json.gz`);
    if (!data) return undefined;
    return JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Today's kept copy only: for a horse, bought once a day at most. */
export async function readRawToday<T>(apiPath: string): Promise<T | undefined> {
  const today = sydneyDay();
  const days = await rawDays(apiPath).catch(() => [] as string[]);
  return days.includes(today) ? readRaw<T>(apiPath, today) : undefined;
}
