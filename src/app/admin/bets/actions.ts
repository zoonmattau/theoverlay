"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { findRunner } from "@/lib/my-bets";

async function viewer() {
  const v = await getViewer();
  if (!isAdmin(v) || !v.id) notFound();
  return v.id;
}

/**
 * Adds a bet: the horse is matched on that date's card. No match, or a name
 * that fits more than one runner, comes back to the page with the choices.
 */
export async function addBet(form: FormData): Promise<void> {
  const userId = await viewer();
  const date = String(form.get("date") ?? "");
  const horse = String(form.get("horse") ?? "").trim();
  const raceId = String(form.get("race") ?? "");
  const stake = Number(String(form.get("stake") ?? "").replace(/[$,\s]/g, ""));
  const odds = Number(String(form.get("odds") ?? "").replace(/[$,\s]/g, ""));
  const kind = ["win", "place", "lay"].includes(String(form.get("kind"))) ? String(form.get("kind")) : "win";
  const account = String(form.get("account") ?? "").trim().slice(0, 60) || null;
  const keep = new URLSearchParams({ date, horse, stake: String(form.get("stake") ?? ""), odds: String(form.get("odds") ?? ""), kind, account: account ?? "" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !horse || !(stake > 0) || !(odds > 1)) redirect(`/admin/bets?${keep}&error=fill`);
  const found = (await findRunner(date, horse)).filter((f) => !raceId || f.race.raceId === raceId);
  if (found.length === 0) redirect(`/admin/bets?${keep}&error=nohorse`);
  if (found.length > 1) redirect(`/admin/bets?${keep}&error=many`);
  const { race, runner, track, meetingId } = found[0];
  await supabaseAdmin().from("personal_bets").insert({
    user_id: userId,
    date,
    race_id: race.raceId,
    meeting_id: meetingId,
    track,
    race_number: race.raceNumber,
    horse: runner.horseName,
    tab_number: runner.tabNumber,
    kind,
    stake_cents: Math.round(stake * 100),
    odds,
    account,
  });
  revalidatePath("/admin/bets");
  redirect("/admin/bets");
}

export async function removeBet(form: FormData): Promise<void> {
  const userId = await viewer();
  await supabaseAdmin().from("personal_bets").delete().eq("id", String(form.get("id"))).eq("user_id", userId);
  revalidatePath("/admin/bets");
}
