import "server-only";

import { supabaseConfigured, supabaseServer } from "./supabase/server";

import { planCovers } from "./billing/plans";

export interface Viewer {
  id?: string;
  email?: string;
  /** A subscription is live. */
  pro: boolean;
  plan?: string;
  /** ISO, when the subscription's paid period ends. */
  accessUntil?: string;
  stripeCustomerId?: string;
  /** Unused day passes. */
  passCredits: number;
  /** Racing dates already opened with a day pass. */
  passDates: string[];
  /** ISO, while a gifted fortnight of the full board is running. */
  bonusUntil?: string;
  /** True while that gift is still running. */
  bonusLive: boolean;
  /** Invite code, once one has been made. */
  referralCode?: string;
}

export const ANON: Viewer = { pro: false, passCredits: 0, passDates: [], bonusLive: false };

/** Can this viewer see the paid parts of a given racing date? */
export function hasAccess(viewer: Viewer, date: string): boolean {
  if (viewer.pro && planCovers(viewer.plan, date)) return true;
  if (viewer.bonusLive) return true;
  return viewer.passDates.includes(date);
}

/**
 * Who is looking, and whether they have paid access. Reads cookies, so call
 * it behind a Suspense boundary. With no Supabase keys everyone is anonymous,
 * unless OVERLAY_OPEN=1 unlocks the site for local development.
 */
export async function getViewer(): Promise<Viewer> {
  // Local escape hatch: everything unlocked, no account needed.
  if (process.env.OVERLAY_OPEN === "1") return { ...ANON, pro: true, plan: "open" };
  if (!supabaseConfigured()) return ANON;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ANON;

  const [{ data: profile }, { data: passes }] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, access_until, stripe_customer_id, pass_credits, bonus_until, referral_code")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("day_passes").select("date").eq("user_id", user.id).order("date", { ascending: false }).limit(30),
  ]);

  const until = profile?.access_until ? new Date(profile.access_until) : undefined;
  const pro = Boolean(until && until.getTime() > Date.now());

  return {
    id: user.id,
    email: user.email ?? undefined,
    pro,
    plan: pro ? (profile?.plan ?? undefined) : undefined,
    accessUntil: until?.toISOString(),
    stripeCustomerId: profile?.stripe_customer_id ?? undefined,
    passCredits: profile?.pass_credits ?? 0,
    passDates: (passes ?? []).map((p) => String(p.date)),
    bonusUntil: profile?.bonus_until ?? undefined,
    bonusLive: Boolean(profile?.bonus_until && new Date(profile.bonus_until).getTime() > Date.now()),
    referralCode: profile?.referral_code ?? undefined,
  };
}
