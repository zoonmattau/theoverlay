import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import { supabaseConfigured } from "@/lib/supabase/server";
import { horseKey } from "./keys";
import type { PublishedMeeting, Selection } from "./types";

export interface StoredCard {
  meetings: PublishedMeeting[];
  selections: Selection[];
  freeRaceId?: string;
  live: boolean;
}

export const storeConfigured = () => supabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * The stored card for a date, or undefined when there is none. A store that
 * does not answer throws: a caller must never mistake an outage for an empty
 * day and set about building a card in its place.
 */
export async function readStoredCard(date: string): Promise<{ card: StoredCard; builtAt: string; pinnedFreeRaceId?: string } | undefined> {
  const { data, error } = await supabaseAdmin().from("cards").select("card, built_at, free_race_id").eq("date", date).maybeSingle();
  if (error) throw new Error(`[cards] read ${date}: ${error.message}`);
  return data ? { card: data.card as StoredCard, builtAt: String(data.built_at), pinnedFreeRaceId: (data.free_race_id as string | null) ?? undefined } : undefined;
}

/** Pins the free race for a date (null goes back to the automatic pick) and patches the stored card to match. */
export async function pinFreeRace(date: string, raceId: string | null, freeRaceId: string | undefined): Promise<void> {
  const stored = await readStoredCard(date);
  if (!stored) return;
  const { error } = await supabaseAdmin()
    .from("cards")
    .update({ free_race_id: raceId, card: { ...stored.card, freeRaceId } })
    .eq("date", date);
  if (error) console.error("[cards]", error.message);
}

/** The dates we hold a card for, newest first, up to `limit`. */
export async function listStoredDates(limit = 60): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from("cards").select("date").order("date", { ascending: false }).limit(limit);
  if (error) console.error("[cards]", error.message);
  return (data ?? []).map((r) => String(r.date));
}

export async function writeStoredCard(date: string, card: StoredCard, seconds: number): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("cards")
    .upsert({ date, card, built_at: new Date().toISOString(), refreshing_at: null, seconds });
  if (error) console.error("[cards]", error.message);
}

/** Takes the refresh lock for a date; false when someone else holds a fresh one. */
export async function claimRefresh(date: string): Promise<boolean> {
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data, error } = await db
    .from("cards")
    .update({ refreshing_at: new Date().toISOString() })
    .eq("date", date)
    .or(`refreshing_at.is.null,refreshing_at.lt.${cutoff}`)
    .select("date");
  if (error) console.error("[cards]", error.message);
  return Boolean(data && data.length > 0);
}

/**
 * Calls taken off by hand for a date: "raceId:tab" keys in fk_cache under
 * mute:<date>, applied on every build so a rebuild does not bring the call
 * back. Set with scripts/mute-call.ts.
 */
export async function readMutes(date: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin().from("fk_cache").select("data").eq("key", `mute:${date}`).maybeSingle();
  if (error) throw new Error(`[mutes] read ${date}: ${error.message}`);
  return new Set(((data?.data as { keys?: string[] } | undefined)?.keys ?? []));
}

export async function writeMutes(date: string, keys: Set<string>): Promise<void> {
  const { error } = await supabaseAdmin().from("fk_cache").upsert({ key: `mute:${date}`, kind: "mute", data: { keys: [...keys] }, at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`[mutes] write ${date}: ${error.message}`);
}

/**
 * Horses we never lay, by normalised name. A lay risks the price rather than
 * a unit, so a horse ruled out by hand stays out of the lays on every build
 * until it is let back in. Unlike a mute this is not tied to a date.
 */
export { horseKey } from "./keys";

export interface LayBlock {
  horse_key: string;
  horse_name: string;
  reason: string | null;
  added_by: string | null;
  added_at: string;
}

export async function readLayBlocks(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin().from("lay_blocks").select("horse_key");
  if (error) throw new Error(`[lay_blocks] read: ${error.message}`);
  return new Set((data ?? []).map((r) => String(r.horse_key)));
}

/** Every block, newest first, for the admin page. */
export async function listLayBlocks(): Promise<LayBlock[]> {
  const { data, error } = await supabaseAdmin().from("lay_blocks").select("*").order("added_at", { ascending: false });
  if (error) throw new Error(`[lay_blocks] list: ${error.message}`);
  return (data ?? []) as LayBlock[];
}

export async function addLayBlock(name: string, by: string, reason?: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("lay_blocks")
    .upsert({ horse_key: horseKey(name), horse_name: name, reason: reason?.trim() || null, added_by: by, added_at: new Date().toISOString() }, { onConflict: "horse_key" });
  if (error) throw new Error(`[lay_blocks] add ${name}: ${error.message}`);
}

export async function removeLayBlock(key: string): Promise<void> {
  const { error } = await supabaseAdmin().from("lay_blocks").delete().eq("horse_key", key);
  if (error) throw new Error(`[lay_blocks] remove ${key}: ${error.message}`);
}
