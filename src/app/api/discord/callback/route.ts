import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { DISCORD_STATE_COOKIE } from "@/app/api/discord/link/route";
import { logEvent } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { discordUserFromCode, syncDiscordMember } from "@/lib/discord";

/** Back from Discord: remember which account is theirs, put them in the server, set the role. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.id) return NextResponse.redirect(new URL("/login?next=/account", request.url));
  const jar = await cookies();
  const state = jar.get(DISCORD_STATE_COOKIE)?.value;
  jar.delete(DISCORD_STATE_COOKIE);
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !state || request.nextUrl.searchParams.get("state") !== state) {
    return NextResponse.redirect(new URL("/account?discord=failed", request.url));
  }
  try {
    const user = await discordUserFromCode(code);
    const { error } = await supabaseAdmin()
      .from("profiles")
      .update({ discord_id: user.id, discord_name: user.username, discord_linked_at: new Date().toISOString() })
      .eq("id", viewer.id);
    if (error) throw new Error(error.message);
    await syncDiscordMember(viewer.id, user.accessToken);
    await logEvent({ user_id: viewer.id, kind: "discord_linked", plan: null, amount_cents: null, meta: { name: user.username } });
    return NextResponse.redirect(new URL("/account?discord=linked", request.url));
  } catch (err) {
    console.error("[discord] link", err);
    // Another member already linked this Discord account.
    const taken = /duplicate|unique/i.test(String(err));
    return NextResponse.redirect(new URL(`/account?discord=${taken ? "taken" : "failed"}`, request.url));
  }
}
