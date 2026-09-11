import { NextResponse, type NextRequest } from "next/server";

import { buildCard, racingToday } from "@/lib/model/source";

export const maxDuration = 300;

/**
 * The morning run. Vercel calls this on the schedule in vercel.json; it
 * builds today's card (every Form King call for the day) so the first visitor
 * gets it from cache. Protected by CRON_SECRET, which Vercel sends as a
 * bearer token.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }
  const date = request.nextUrl.searchParams.get("date") ?? racingToday();
  const { card, seconds } = await buildCard(date);
  const races = card.meetings.reduce((a, m) => a + m.races.length, 0);
  return NextResponse.json({ date, meetings: card.meetings.length, races, selections: card.selections.length, seconds });
}
