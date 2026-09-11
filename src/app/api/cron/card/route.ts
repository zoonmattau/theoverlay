import { NextResponse, type NextRequest } from "next/server";

import { sendMorningTips } from "@/lib/email/tips";
import { buildCard, racingToday } from "@/lib/model/source";

export const maxDuration = 300;

/**
 * The morning run. Vercel calls this on the schedule in vercel.json; it
 * builds today's card (every Form King call for the day) and emails the
 * calls to members who asked for them. Protected by CRON_SECRET, which
 * Vercel sends as a bearer token. ?date=yyyy-mm-dd builds another day,
 * ?email=0 skips the send, ?email=force sends again.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }
  const today = racingToday();
  const date = request.nextUrl.searchParams.get("date") ?? today;
  const email = request.nextUrl.searchParams.get("email") ?? "1";
  const { card, seconds } = await buildCard(date);
  const races = card.meetings.reduce((a, m) => a + m.races.length, 0);
  let mail: { sent: number; skipped: string } = { sent: 0, skipped: "off" };
  if (date === today && email !== "0" && races > 0) mail = await sendMorningTips(date, card, email === "force");
  return NextResponse.json({ date, meetings: card.meetings.length, races, selections: card.selections.length, seconds, mail });
}
