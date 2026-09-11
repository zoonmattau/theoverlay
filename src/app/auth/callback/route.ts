import { NextResponse, type NextRequest } from "next/server";

import { applyReferral } from "@/lib/referrals";
import { supabaseServer } from "@/lib/supabase/server";

/** Email confirmation and magic links land here, then go on to `next`. */
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
      return NextResponse.redirect(`${origin}${safe}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
