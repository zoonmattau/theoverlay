"use server";

import { revalidatePath } from "next/cache";

import { syncDiscordMember } from "@/lib/discord";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

/** Spend one day pass on a racing date. Returns false when there are none left. */
export async function redeemPass(date: string): Promise<boolean> {
  if (!supabaseConfigured() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("redeem_day_pass", { p_date: date });
  if (error) return false;
  revalidatePath("/", "layout");
  // The pass opens the members' channels in Discord for the day too.
  if (data) {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) await syncDiscordMember(auth.user.id).catch(() => {});
  }
  return Boolean(data);
}
