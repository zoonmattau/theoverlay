import "server-only";

import { after } from "next/server";

import { attributeSignup } from "@/lib/affiliates";
import type { Arrival } from "@/lib/arrival";
import { supabaseAdmin } from "@/lib/billing/access";
import { sendTodaysTipsTo } from "@/lib/email/tips";
import { applyReferral } from "@/lib/referrals";

/** What the sign-up form said before Google took over: applied once to the account Google creates. */
export interface ProviderStash {
  terms?: boolean;
  marketing?: boolean;
  aff?: string;
  ref?: string;
  provider?: string;
  arrival?: Arrival;
}

/**
 * A Google sign-up skips our form, so the consent, email choice, affiliate
 * and invite code it collected are stamped on the new account here, once,
 * on an account that has not accepted the terms yet. A returning user has
 * already, so nothing changes for them.
 */
/**
 * Where a Google account first came from, stamped whenever Google signs
 * someone in and the profile has nothing yet. Pressing Continue with Google
 * on the log-in page makes an account without the sign-up step, and those
 * members read as Unknown in the admin until 30 Sep 2026.
 */
export async function stampArrival(userId: string, arrival?: Arrival): Promise<void> {
  const update = { source: "google", ...(arrival ? { landing: arrival.landing, referrer: arrival.referrer ?? null, utm: arrival.utm ?? null } : {}) };
  const { error } = await supabaseAdmin().from("profiles").update(update).eq("id", userId).is("source", null).is("landing", null);
  if (error) console.error("[arrival]", error.message);
}

export async function finishProviderSignup(userId: string, meta: Record<string, unknown>, stash: ProviderStash, email?: string): Promise<void> {
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
