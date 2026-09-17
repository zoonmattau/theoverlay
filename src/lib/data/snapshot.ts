import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";

/**
 * Snapshots of the Datahub's heaviest answers, written by the card cron
 * (morning and evening) into fk_cache, so a race page reads a few hundred
 * kilobytes of JSON instead of grouping 370,000 runs on every load. The
 * rankings move by a day's racing at most, so a snapshot a day old is fine.
 */
const KIND = "hub";
const FRESH_MS = 30 * 60 * 60_000;

export async function readSnapshot<T>(key: string): Promise<T | undefined> {
  const { data } = await supabaseAdmin().from("fk_cache").select("data, at").eq("key", `${KIND}:${key}`).maybeSingle();
  if (!data || Date.now() - new Date(String(data.at)).getTime() > FRESH_MS) return undefined;
  return data.data as T;
}

export async function writeSnapshot<T>(key: string, value: T): Promise<void> {
  const { error } = await supabaseAdmin().from("fk_cache").upsert({ key: `${KIND}:${key}`, kind: KIND, data: value as never, at: new Date().toISOString() }, { onConflict: "key" });
  if (error) console.error("[hub snapshot]", key, error.message);
}
