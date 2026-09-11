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

export async function readStoredCard(date: string): Promise<{ card: StoredCard; builtAt: string } | undefined> {
  const { data, error } = await supabaseAdmin().from("cards").select("card, built_at").eq("date", date).maybeSingle();
  if (error) console.error("[cards]", error.message);
  return data ? { card: data.card as StoredCard, builtAt: String(data.built_at) } : undefined;
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
