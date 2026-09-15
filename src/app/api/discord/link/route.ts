import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

import { getViewer } from "@/lib/auth";
import { discordAuthUrl, discordLinkConfigured } from "@/lib/discord";

export const DISCORD_STATE_COOKIE = "overlay_discord_state";

/** Sends a logged-in member to Discord to link their account. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.id) return NextResponse.redirect(new URL("/login?next=/account", request.url));
  if (!discordLinkConfigured()) return NextResponse.redirect(new URL("/account?discord=off", request.url));
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(DISCORD_STATE_COOKIE, state, { maxAge: 600, path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  return NextResponse.redirect(discordAuthUrl(state));
}
