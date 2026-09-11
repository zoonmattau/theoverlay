"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

/** Mark a call as taken, or update the price and stake you got. */
export async function takeBet(input: { date: string; raceId: string; tab: number; side: "back" | "lay"; price?: number; stake?: number }): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id) return;
  const supabase = await supabaseServer();
  const price = input.price && input.price > 1 ? Math.round(input.price * 100) / 100 : null;
  const stake = input.stake && input.stake > 0 ? Math.round(input.stake * 100) / 100 : 1;
  await supabase
    .from("my_bets")
    .upsert({ user_id: viewer.id, date: input.date, race_id: input.raceId, tab_number: input.tab, side: input.side, price, stake }, { onConflict: "user_id,race_id,tab_number" });
  revalidatePath("/tips");
}

export async function untakeBet(input: { raceId: string; tab: number }): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id) return;
  const supabase = await supabaseServer();
  await supabase.from("my_bets").delete().eq("user_id", viewer.id).eq("race_id", input.raceId).eq("tab_number", input.tab);
  revalidatePath("/tips");
}
