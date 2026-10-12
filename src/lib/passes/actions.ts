"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/billing/access";
import { syncDiscordMember } from "@/lib/discord";
import { LATE_PASS_HOUR } from "@/lib/passes/late";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

/** Today and the hour, Sydney time. */
function sydney() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { today: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/**
 * Spend one day pass on a racing date. Returns false when there are none left.
 * Spent on today from 4pm Sydney, the same pass opens tomorrow too.
 */
export async function redeemPass(date: string): Promise<boolean> {
  if (!supabaseConfigured() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("redeem_day_pass", { p_date: date });
  if (error) return false;
  const { data: auth } = await supabase.auth.getUser();
  const now = sydney();
  if (data && auth.user && date === now.today && now.hour >= LATE_PASS_HOUR) {
    const tomorrow = new Date(Date.parse(`${date}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
    await supabaseAdmin().from("day_passes").upsert({ user_id: auth.user.id, date: tomorrow }, { onConflict: "user_id,date", ignoreDuplicates: true });
  }
  revalidatePath("/", "layout");
  // The pass opens the members' channels in Discord for the day too.
  if (data && auth.user) await syncDiscordMember(auth.user.id).catch(() => {});
  return Boolean(data);
}
