import { NextResponse, type NextRequest } from "next/server";

import { EMAILS } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";
import { sendMorningTips } from "@/lib/email/tips";
import { supabaseAdmin } from "@/lib/billing/access";
import { postCalls, postResults, syncDiscordMembers } from "@/lib/discord";
import { buildCard, racingToday } from "@/lib/model/source";
import { readStoredCard } from "@/lib/model/store";

export const maxDuration = 300;

/**
 * The morning run, 11am Sydney so the prices have settled and the card has been looked at. Vercel calls
 * this on the schedule in vercel.json (UTC, so it drifts an hour with
 * daylight saving); it builds today's card (every Form King call for the
 * day) and emails the calls to members who asked for them. Protected by
 * CRON_SECRET, which Vercel sends as a bearer token. ?date=yyyy-mm-dd builds
 * another day, ?email=0 skips the send, ?email=force sends again,
 * ?tomorrow=1 builds the next day so the board is ready when the date rolls
 * over.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }
  const today = racingToday();
  const tomorrow = request.nextUrl.searchParams.get("tomorrow") === "1";
  const date = request.nextUrl.searchParams.get("date") ?? (tomorrow ? nextDay(today) : today);
  const email = request.nextUrl.searchParams.get("email") ?? "1";
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let built: Awaited<ReturnType<typeof buildCard>>;
  try {
    built = await buildCard(date);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] build failed", message);
    for (const to of admins) await sendEmail(to, EMAILS.cronFailed(date, message));
    return NextResponse.json({ date, error: message }, { status: 500 });
  }
  const { card, seconds } = built;
  // Raw feed responses older than three days are no use to anyone.
  await supabaseAdmin().from("fk_cache").delete().lt("at", new Date(Date.now() - 3 * 86400_000).toISOString());
  const races = card.meetings.reduce((a, m) => a + m.races.length, 0);
  if (races === 0 && date === today) {
    for (const to of admins) await sendEmail(to, EMAILS.cronFailed(date, "The build finished but found no races."));
  }
  let mail: { sent: number; skipped: string } = { sent: 0, skipped: "off" };
  if (date === today && email !== "0" && races > 0) mail = await sendMorningTips(date, card, email === "force");
  // Discord: today's calls with the email, tomorrow's into the members' early look.
  let discord: { linked: number; members: number } | undefined;
  if (races > 0) {
    await postCalls(date, card, { early: date !== today });
    if (date === today) discord = await syncDiscordMembers();
  }
  // The evening run also closes out today: the results go up if no page view has done it.
  if (tomorrow) {
    const done = await readStoredCard(today);
    if (done) await postResults(today, done.card);
  }
  return NextResponse.json({ date, meetings: card.meetings.length, races, selections: card.selections.length, seconds, mail, discord });
}

/** yyyy-mm-dd plus one day. */
function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
