import { NextRequest } from "next/server";

import { GET as card } from "@/app/api/cron/card/route";

export const maxDuration = 300;

/** The evening run: tomorrow's card, no email, so the board is ready at midnight. */
export function GET(request: NextRequest) {
  const url = new URL("/api/cron/card?tomorrow=1&email=0", request.url);
  return card(new NextRequest(url, { headers: request.headers }));
}
