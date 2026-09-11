"use server";

import { revalidatePath } from "next/cache";

import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

/** Spend one day pass on a racing date. Returns false when there are none left. */
export async function redeemPass(date: string): Promise<boolean> {
  if (!supabaseConfigured() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("redeem_day_pass", { p_date: date });
  if (error) return false;
  revalidatePath("/", "layout");
  return Boolean(data);
}
