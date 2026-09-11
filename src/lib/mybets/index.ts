import "server-only";

import { supabaseServer } from "@/lib/supabase/server";

export interface MyBet {
  race_id: string;
  tab_number: number;
  side: "back" | "lay";
  price: number | null;
  stake: number;
}

/** The signed-in member's marked calls for a date, keyed race:tab. */
export async function myBets(userId: string | undefined, date: string): Promise<Map<string, MyBet>> {
  const out = new Map<string, MyBet>();
  if (!userId) return out;
  const supabase = await supabaseServer();
  const { data } = await supabase.from("my_bets").select("race_id, tab_number, side, price, stake").eq("user_id", userId).eq("date", date);
  for (const b of (data ?? []) as MyBet[]) out.set(`${b.race_id}:${b.tab_number}`, b);
  return out;
}
