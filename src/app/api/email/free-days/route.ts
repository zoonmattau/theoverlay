import { NextResponse, type NextRequest } from "next/server";

import { claimFreeDays, freeDaysTokenValid } from "@/lib/email/offer";

/** One click from a win-back email, no login needed: the free days go on, then the board opens. */
export async function GET(request: NextRequest) {
  const u = request.nextUrl.searchParams.get("u") ?? "";
  const t = request.nextUrl.searchParams.get("t") ?? "";
  const site = request.nextUrl.origin;
  if (!u || !t || !freeDaysTokenValid(u, t)) return NextResponse.redirect(`${site}/pricing?free=invalid`);
  const { result } = await claimFreeDays(u);
  return NextResponse.redirect(`${site}/account?free=${result}`);
}
