import { NextResponse, type NextRequest } from "next/server";

import { getTodayCard } from "@/lib/model/source";

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
  const started = Date.now();
  const { date, meetings, selections } = await getTodayCard();
  const races = meetings.reduce((a, m) => a + m.races.length, 0);
  return NextResponse.json({
    date,
    meetings: meetings.length,
    races,
    selections: selections.length,
    seconds: Math.round((Date.now() - started) / 1000),
  });
}
