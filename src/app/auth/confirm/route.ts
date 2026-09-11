import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { applyReferral } from "@/lib/referrals";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Email links land here on our own domain. The template carries the token
 * hash, we verify it with Supabase server-side, and send the person on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next") ?? nextFromRedirect(searchParams.get("redirect_to")));

  if (tokenHash && type) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      const ref = data.user?.user_metadata?.ref;
      if (data.user && type === "signup" && typeof ref === "string" && ref) await applyReferral(data.user.id, ref);
      return NextResponse.redirect(`${origin}${type === "recovery" ? "/reset" : next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}

/** Only ever a local path. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** The old callback URL carried next as a query param; keep honouring it. */
function nextFromRedirect(redirectTo: string | null): string | null {
  if (!redirectTo) return null;
  try {
    return new URL(redirectTo).searchParams.get("next");
  } catch {
    return null;
  }
}
