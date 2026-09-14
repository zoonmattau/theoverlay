"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { tipsterForUser } from "@/lib/creators";
import { getCard } from "@/lib/model/source";

const paths = () => ["/tipster", "/tips", "/"].forEach((p) => revalidatePath(p));

/** A tipster posts a call on a runner from today's card. */
export async function postTip(form: FormData): Promise<void> {
  const viewer = await getViewer();
  const tipster = await tipsterForUser(viewer.id);
  if (!tipster) return;
  const date = String(form.get("date") ?? "");
  const raceId = String(form.get("raceId") ?? "");
  const tab = Number(form.get("tab"));
  const side = form.get("side") === "lay" ? "lay" : "back";
  const price = Math.round(Number(form.get("price")) * 100) / 100;
  const comment = String(form.get("comment") ?? "").trim().slice(0, 280) || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !raceId || !tab || !(price > 1)) return;

  // The runner has to be on the card, and the race not yet run.
  const card = await getCard(date, true);
  const meeting = card.meetings.find((m) => m.races.some((r) => r.raceId === raceId));
  const race = meeting?.races.find((r) => r.raceId === raceId);
  const runner = race?.runners.find((x) => x.tabNumber === tab);
  if (!meeting || !race || !runner || runner.scratched || race.result?.length) return;

  await supabaseAdmin().from("creator_tips").upsert(
    {
      affiliate_id: tipster.id, date, meeting_id: meeting.meetingId, race_id: raceId, race_number: race.raceNumber, track: meeting.track,
      tab_number: tab, horse_name: runner.horseName, side, price, comment,
    },
    { onConflict: "affiliate_id,race_id,tab_number" },
  );
  paths();
}

/** Only before the race has run; a settled call stays on the record. */
export async function removeTip(id: number): Promise<void> {
  const viewer = await getViewer();
  const tipster = await tipsterForUser(viewer.id);
  if (!tipster) return;
  await supabaseAdmin().from("creator_tips").delete().eq("id", id).eq("affiliate_id", tipster.id).is("settled_at", null);
  paths();
}

export async function saveBlurb(form: FormData): Promise<void> {
  const viewer = await getViewer();
  const tipster = await tipsterForUser(viewer.id);
  if (!tipster) return;
  const blurb = String(form.get("blurb") ?? "").trim().slice(0, 200) || null;
  await supabaseAdmin().from("affiliates").update({ blurb }).eq("id", tipster.id);
  paths();
}
