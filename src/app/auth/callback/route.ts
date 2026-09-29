import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { ARRIVAL_COOKIE, parseArrival } from "@/lib/arrival";
import { finishProviderSignup, stampArrival, type ProviderStash } from "@/lib/provider-signup";
import { applyReferral } from "@/lib/referrals";
import { OAUTH_COOKIE } from "@/lib/social";
import { supabaseServer } from "@/lib/supabase/server";

/** Email confirmation, magic links and Google land here, then go on to `next`. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // An invite is honoured once the email is confirmed, never before.
      const ref = data.user?.user_metadata?.ref;
      if (data.user && typeof ref === "string" && ref) await applyReferral(data.user.id, ref);
      if (data.user) await finishFromCookie(data.user.id, data.user.user_metadata ?? {}, data.user.email);
      return NextResponse.redirect(`${origin}${safe}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}

/** The stash the redirect flow left in a cookie, applied once and then dropped. */
async function finishFromCookie(userId: string, meta: Record<string, unknown>, email?: string): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  if (!raw) {
    // Google by redirect from the log-in page: no stash, but still a first visit to keep.
    if (meta.iss || meta.provider_id) await stampArrival(userId, parseArrival(jar.get(ARRIVAL_COOKIE)?.value));
    return;
  }
  jar.delete(OAUTH_COOKIE);
  let stash: ProviderStash;
  try {
    stash = JSON.parse(raw);
  } catch {
    return;
  }
  await finishProviderSignup(userId, meta, stash, email);
}
