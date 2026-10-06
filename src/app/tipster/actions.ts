"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { clean } from "@/components/SocialLinks";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { parseStake, tipsterForUser } from "@/lib/creators";
import { postTipsterCall } from "@/lib/discord";
import { notifyFollowers } from "@/lib/email/tipster";
import { getCard } from "@/lib/model/source";

const paths = (...more: string[]) => ["/tipster", "/tips", "/tipsters", "/", ...more].forEach((p) => revalidatePath(p));

/** Followers hear about a post after a short wait, so a run of posts is one email. */
const NOTIFY_DELAY_MS = 90_000;

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
  const bookie = String(form.get("bookie") ?? "").trim().slice(0, 40) || null;
  const bookiePrice = Number(form.get("bookiePrice"));
  const bookie_price = bookiePrice > 1 ? Math.round(bookiePrice * 100) / 100 : null;
  const stake = parseStake(form.get("stake"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !raceId || !tab || !(price > 1)) return;

  // The runner has to be on the card, and the race not yet run.
  const card = await getCard(date, true);
  const meeting = card.meetings.find((m) => m.races.some((r) => r.raceId === raceId));
  const race = meeting?.races.find((r) => r.raceId === raceId);
  const runner = race?.runners.find((x) => x.tabNumber === tab);
  if (!meeting || !race || !runner || runner.scratched || race.result?.length) return;
  // Nothing goes out after the jump. Admins can, for testing and for a call missed by the refresh.
  if (!viewer.admin && race.jumpTime && new Date(race.jumpTime).getTime() < Date.now()) return;

  const { data: existing } = await supabaseAdmin().from("creator_tips").select("id").eq("affiliate_id", tipster.id).eq("race_id", raceId).eq("tab_number", tab).maybeSingle();
  await supabaseAdmin().from("creator_tips").upsert(
    {
      affiliate_id: tipster.id, date, meeting_id: meeting.meetingId, race_id: raceId, race_number: race.raceNumber, track: meeting.track,
      tab_number: tab, horse_name: runner.horseName, side, price, stake, comment, bookie, bookie_price,
      // The best price we could see at the time, so a price a long way above it can be flagged.
      market_at_post: runner.marketPrice ?? null,
    },
    { onConflict: "affiliate_id,race_id,tab_number" },
  );
  paths(`/racing/${date}/${encodeURIComponent(meeting.meetingId)}/${encodeURIComponent(raceId)}`);
  // Off public view, the call stays on the site for the tipster and the admins: no Discord, no email.
  if (!tipster.listed) return;
  after(() =>
    postTipsterCall(
      { name: tipster.name, code: tipster.code },
      { track: meeting.track, race_number: race.raceNumber, tab_number: tab, horse_name: runner.horseName, side, price, stake, bookie_price, comment, bookie },
      { date, meetingId: meeting.meetingId, raceId, jumpTime: race.jumpTime, update: Boolean(existing) },
    ),
  );
  after(async () => {
    await new Promise((r) => setTimeout(r, NOTIFY_DELAY_MS));
    await notifyFollowers(tipster.id);
  });
}

/** Only before the race has run; a settled call stays on the record. */
export async function removeTip(id: number, path?: string): Promise<void> {
  const viewer = await getViewer();
  const tipster = await tipsterForUser(viewer.id);
  if (!tipster) return;
  await supabaseAdmin().from("creator_tips").delete().eq("id", id).eq("affiliate_id", tipster.id).is("settled_at", null);
  paths(...(path?.startsWith("/racing/") ? [path] : []));
}

export async function saveBlurb(form: FormData): Promise<void> {
  const viewer = await getViewer();
  const tipster = await tipsterForUser(viewer.id);
  if (!tipster) return;
  const blurb = String(form.get("blurb") ?? "").trim().slice(0, 200) || null;
  const handle = (k: string) => clean(String(form.get(k) ?? "")).slice(0, 60) || null;
  await supabaseAdmin().from("affiliates").update({ blurb, instagram: handle("instagram"), twitter: handle("twitter"), tiktok: handle("tiktok") }).eq("id", tipster.id);
  paths();
}

/**
 * The tipster's avatar: a letter or two, and a logo already cropped to 256px
 * in the browser (a JPEG data URL), or remove the logo they had.
 */
export async function saveAvatar(form: FormData): Promise<void> {
  const viewer = await getViewer();
  const tipster = await tipsterForUser(viewer.id);
  if (!tipster) return;
  const letter = String(form.get("letter") ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || null;
  const patch: { avatar_letter: string | null; avatar_url?: string | null } = { avatar_letter: letter };
  if (form.get("remove") === "1") patch.avatar_url = null;
  const image = String(form.get("image") ?? "");
  const m = image.match(/^data:image\/jpeg;base64,(.+)$/);
  if (m) {
    const bytes = Buffer.from(m[1], "base64");
    // A 256px JPEG is a few tens of kilobytes; anything far bigger is not what the picker sends.
    if (bytes.length > 500_000) return;
    const path = `tipsters/${tipster.id}-${Date.now()}.jpg`;
    const db = supabaseAdmin();
    const { error } = await db.storage.from("avatars").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) {
      console.error("[tipster] avatar upload", error.message);
      return;
    }
    patch.avatar_url = db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }
  await supabaseAdmin().from("affiliates").update(patch).eq("id", tipster.id);
  paths(`/t/${tipster.code}`);
}

