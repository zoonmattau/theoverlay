import { NextResponse, type NextRequest } from "next/server";

import { racingToday, refreshPrices } from "@/lib/model/source";

export const maxDuration = 60;

/**
 * The price poll: BetWatch's bookmaker and exchange prices for every race
 * inside the window before its jump, and a rebuild of the card on them
 * when any moved. Called every five minutes; page views run the same poll
 * between calls. Protected by CRON_SECRET as a bearer token or ?key=.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}` && request.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }
  const date = request.nextUrl.searchParams.get("date") ?? racingToday();
  const out = await refreshPrices(date);
  return NextResponse.json({ date, ...out });
}
