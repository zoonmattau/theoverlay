import { NextRequest } from "next/server";

import { GET as card } from "@/app/api/cron/card/route";
import { heldUntil } from "@/lib/cron";

export const maxDuration = 300;

/** The evening run, 9pm Sydney (?at=21, see the card cron): tomorrow's card, no email, so the board is ready at midnight. */
export function GET(request: NextRequest) {
  const held = heldUntil(request);
  if (held) return held;
  const url = new URL("/api/cron/card?tomorrow=1&email=0", request.url);
  return card(new NextRequest(url, { headers: request.headers }));
}
