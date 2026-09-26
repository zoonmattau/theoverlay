import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import { supabaseConfigured } from "@/lib/supabase/server";
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

/**
 * The card, and the runs beside it. A runner's last runs were four fifths of
 * the stored card and only ever read on the race being looked at, so they go
 * to race_runs keyed by race and the card carries none.
 *
 * The runs are written first and the card is only slimmed once they are safely
 * down. If that write fails the card keeps them inline, the way it always did,
 * so a missing table or a bad minute costs nothing but the old size.
 */
export async function writeStoredCard(date: string, card: StoredCard, seconds: number, opts: { runs?: boolean } = {}): Promise<void> {
  const db = supabaseAdmin();
  const at = new Date().toISOString();
  const rows: { date: string; race_id: string; runs: Record<string, unknown>; built_at: string }[] = [];
  for (const m of card.meetings) {
    for (const r of m.races) {
      const runs: Record<string, unknown> = {};
      for (const x of r.runners) if (x.runs?.length) runs[String(x.tabNumber)] = x.runs;
      if (Object.keys(runs).length) rows.push({ date, race_id: r.raceId, runs, built_at: at });
    }
  }

  // A reprice leaves the form alone, so it writes no runs and slims the card
  // on the ones already stored. It checks they are there first: slimming
  // against rows that do not exist would take the day's form off the card
  // with nowhere to read it back from.
  let stored = false;
  if (opts.runs === false) {
    const { count, error } = await db.from("race_runs").select("race_id", { count: "exact", head: true }).eq("date", date);
    if (error) console.error("[race_runs]", error.message);
    stored = !error && (count ?? 0) > 0;
  } else if (rows.length > 0) {
    stored = true;
    // In batches, so one oversized statement cannot lose the lot.
    for (let i = 0; i < rows.length; i += 25) {
      const { error } = await db.from("race_runs").upsert(rows.slice(i, i + 25), { onConflict: "date,race_id" });
      if (error) {
        console.error("[race_runs]", error.message);
        stored = false;
        break;
      }
    }
  }

  const lean: StoredCard = stored
    ? {
        ...card,
        meetings: card.meetings.map((m) => ({
          ...m,
          races: m.races.map((r) => ({
            ...r,
            runners: r.runners.map((x) => {
              const { runs: _runs, ...rest } = x;
              void _runs;
              return rest as typeof x;
            }),
          })),
        })),
      }
    : card;

  const { error } = await db.from("cards").upsert({ date, card: lean, built_at: at, refreshing_at: null, seconds });
  if (error) console.error("[cards]", error.message);
}

/**
 * Whether two cards say the same thing: every price, call and result, leaving
 * out the runs (kept in race_runs, not on the stored card) and the time each
 * price was last looked at, which moves on every poll whether or not it did.
 */
export function sameCard(a: StoredCard, b: StoredCard): boolean {
  const skip = (key: string, value: unknown) => (key === "runs" || key === "marketAt" ? undefined : value);
  return JSON.stringify(a, skip) === JSON.stringify(b, skip);
}

/** A rebuild that changed nothing: the build time moves on and the 1.3 MB card is not written again. */
export async function touchStoredCard(date: string, seconds: number): Promise<void> {
  const { error } = await supabaseAdmin().from("cards").update({ built_at: new Date().toISOString(), refreshing_at: null, seconds }).eq("date", date);
  if (error) console.error("[cards] touch", error.message);
}

/** One race's runs, by tab number. Empty when the race has none stored. */
export async function readRaceRuns(date: string, raceId: string): Promise<Record<string, unknown[]>> {
  const { data, error } = await supabaseAdmin().from("race_runs").select("runs").eq("date", date).eq("race_id", raceId).maybeSingle();
  if (error) throw new Error(`[race_runs] read ${date} ${raceId}: ${error.message}`);
  return (data?.runs as Record<string, unknown[]> | undefined) ?? {};
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
 * Whether this deployment is the newest to have built a card. Vercel keeps
 * older deployments serving tabs opened before a deploy, and their page views
 * rebuild the card with the old code: on 26 Sep 2026 they reopened Gunnedah
 * and re-settled the record every few minutes. Each build records its
 * deployment's build time, and one from an older deployment stands down.
 * Only on Vercel: a local build never claims, so it cannot lock production out.
 */
export async function newestDeploy(): Promise<boolean> {
  const mine = Number(process.env.OVERLAY_BUILT_AT ?? 0);
  if (process.env.VERCEL !== "1" || !mine) return true;
  const db = supabaseAdmin();
  const { data, error } = await db.from("fk_cache").select("data").eq("key", "deploy").maybeSingle();
  if (error) {
    console.error("[deploy] read", error.message);
    return true;
  }
  const newest = Number((data?.data as { builtAt?: number } | undefined)?.builtAt ?? 0);
  if (mine < newest) return false;
  if (mine > newest) {
    const { error: e } = await db.from("fk_cache").upsert({ key: "deploy", kind: "deploy", data: { builtAt: mine }, at: new Date().toISOString() }, { onConflict: "key" });
    if (e) console.error("[deploy] write", e.message);
  }
  return true;
}

/**
 * Races called off on a date, raceIds in fk_cache under abandoned:<date>.
 * The feeds do not say so on every build, and builds overlap, so once one
 * build sees a race abandoned every later one reads it here.
 */
export async function readAbandoned(date: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin().from("fk_cache").select("data").eq("key", `abandoned:${date}`).maybeSingle();
  if (error) throw new Error(`[abandoned] read ${date}: ${error.message}`);
  return new Set(((data?.data as { raceIds?: string[] } | undefined)?.raceIds ?? []));
}

export async function writeAbandoned(date: string, raceIds: Set<string>): Promise<void> {
  const { error } = await supabaseAdmin().from("fk_cache").upsert({ key: `abandoned:${date}`, kind: "abandoned", data: { raceIds: [...raceIds] }, at: new Date().toISOString() }, { onConflict: "key" });
  if (error) console.error(`[abandoned] write ${date}: ${error.message}`);
}

/** The races a day's review story tells, in order, as an admin set them. */
export async function readStory(date: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from("fk_cache").select("data").eq("key", `story:${date}`).maybeSingle();
  if (error) throw new Error(`[story] read ${date}: ${error.message}`);
  return ((data?.data as { races?: string[] } | undefined)?.races ?? []);
}

export async function writeStory(date: string, races: string[]): Promise<void> {
  const { error } = await supabaseAdmin().from("fk_cache").upsert({ key: `story:${date}`, kind: "story", data: { races }, at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`[story] write ${date}: ${error.message}`);
}

/** Takes one call off for a date, or puts it back; the next build honours it. */
export async function setMute(date: string, raceId: string, tab: number, off: boolean): Promise<void> {
  const keys = await readMutes(date);
  const key = `${raceId}:${tab}`;
  if (off) keys.add(key);
  else keys.delete(key);
  await writeMutes(date, keys);
}
