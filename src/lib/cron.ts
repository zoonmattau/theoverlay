import { NextResponse, type NextRequest } from "next/server";

import { sydneyHour } from "@/lib/model/source";

/**
 * Vercel's crons run on UTC, so a job meant for one Sydney hour is scheduled
 * in both UTC hours it can fall in (daylight saving or not) with ?at=H. This
 * holds the call that lands outside hour H in Sydney. Without ?at, a call
 * made by hand, it runs.
 */
export function heldUntil(request: NextRequest): NextResponse | undefined {
  const at = request.nextUrl.searchParams.get("at");
  if (at === null) return undefined;
  const hour = Math.floor(sydneyHour());
  return hour === Number(at) ? undefined : NextResponse.json({ held: true, hour, runsAt: Number(at) });
}
