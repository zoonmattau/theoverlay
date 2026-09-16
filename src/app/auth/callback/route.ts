import { cookies } from "next/headers";
import { after, NextResponse, type NextRequest } from "next/server";

import type { Arrival } from "@/lib/arrival";
import { OAUTH_COOKIE } from "@/lib/social";
import { attributeSignup } from "@/lib/affiliates";
import { sendTodaysTipsTo } from "@/lib/email/tips";
import { supabaseAdmin } from "@/lib/billing/access";
import { applyReferral } from "@/lib/referrals";
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
      if (data.user) await finishProviderSignup(data.user.id, data.user.user_metadata ?? {}, data.user.email);
      return NextResponse.redirect(`${origin}${safe}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}

/**
 * A Google sign-up skips our form, so the consent, email choice, affiliate
 * and invite code it collected wait in a cookie and land here, once, on an
 * account that has not accepted the terms yet. A returning user has
 * already, so nothing changes for them.
 */
async function finishProviderSignup(userId: string, meta: Record<string, unknown>, email?: string): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  if (!raw) return;
  jar.delete(OAUTH_COOKIE);
  let stash: { terms?: boolean; marketing?: boolean; aff?: string; ref?: string; provider?: string; arrival?: Arrival };
  try {
    stash = JSON.parse(raw);
  } catch {
    return;
  }
  const db = supabaseAdmin();
  const { data: prof } = await db.from("profiles").select("accepted_terms_at, full_name").eq("id", userId).maybeSingle();
  if (!prof || prof.accepted_terms_at) return;
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
  await db
    .from("profiles")
    .update({
      accepted_terms_at: stash.terms ? new Date().toISOString() : null,
      marketing_opt_in: Boolean(stash.marketing),
      full_name: prof.full_name || (name ? name.slice(0, 120) : null),
      source: stash.ref ? "invite" : stash.aff ? `affiliate:${stash.aff}` : "google",
      ...(stash.arrival ? { landing: stash.arrival.landing, referrer: stash.arrival.referrer ?? null, utm: stash.arrival.utm ?? null } : {}),
    })
    .eq("id", userId);
  if (stash.aff) await attributeSignup(userId, stash.aff);
  if (stash.ref) await applyReferral(userId, stash.ref);
  if (email) after(() => sendTodaysTipsTo(userId, email, Boolean(stash.marketing)));
}
