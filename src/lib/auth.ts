import "server-only";
import { cache } from "react";

import { supabaseAdmin } from "./billing/access";
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
  /** Access is paused by an admin, so the board stays closed. */
  paused: boolean;
  /** Listed in ADMIN_EMAILS or flagged in the panel: runs admin and sees every race free. */
  admin: boolean;
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
  /** Wants the morning tips email. */
  tipsEmails: boolean;
  /** Runs a tipster account, so the board is open to them. */
  tipster: boolean;
  /** The linked Discord account, once there is one. */
  discordName?: string;
  details: Details;
}

export interface Details {
  fullName: string;
  phone: string;
  address1: string;
  address2: string;
  suburb: string;
  state: string;
  postcode: string;
  /** yyyy-mm-dd */
  dob: string;
}

export const NO_DETAILS: Details = { fullName: "", phone: "", address1: "", address2: "", suburb: "", state: "", postcode: "", dob: "" };

/** Comma-separated in ADMIN_EMAILS. */
export function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && list.includes(email.toLowerCase()));
}

export const ANON: Viewer = { pro: false, paused: false, admin: false, tipsEmails: false, tipster: false, details: NO_DETAILS, passCredits: 0, passDates: [], bonusLive: false };

/** Can this viewer see the paid parts of a given racing date? */
export function hasAccess(viewer: Viewer, date: string): boolean {
  if (viewer.admin || viewer.tipster) return true;
  if (viewer.paused) return false;
  if (viewer.pro && planCovers(viewer.plan, date)) return true;
  if (viewer.bonusLive) return true;
  return viewer.passDates.includes(date);
}

/** The API is for members on a plan, trials included: day passes, gift days and tipster accounts do not open it. */
export function apiAccess(viewer: Viewer, date: string): boolean {
  if (viewer.admin) return true;
  return viewer.pro && !viewer.paused && planCovers(viewer.plan, date);
}

/**
 * Who is looking, and whether they have paid access. Reads cookies, so call
 * it behind a Suspense boundary. With no Supabase keys everyone is anonymous,
 * unless OVERLAY_OPEN=1 unlocks the site for local development.
 */
export const getViewer = cache(async function getViewer(): Promise<Viewer> {
  // Local escape hatch: everything unlocked, no account needed.
  // OVERLAY_ADMIN=1 alongside it opens the admin panel too.
  if (process.env.OVERLAY_OPEN === "1") return { ...ANON, pro: true, plan: "open", admin: process.env.OVERLAY_ADMIN === "1" };
  if (!supabaseConfigured()) return ANON;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ANON;

  const [{ data: profile }, { data: passes }, { data: tipster }] = await Promise.all([
    supabase.from("profiles").select(PROFILE).eq("id", user.id).maybeSingle(),
    supabase.from("day_passes").select("date").eq("user_id", user.id).order("date", { ascending: false }).limit(30),
    supabaseAdmin().from("affiliates").select("id").eq("user_id", user.id).eq("active", true).maybeSingle(),
  ]);

  // Last seen, for the admin panel, written at most every 15 minutes.
  const seen = profile?.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
  if (profile && Date.now() - seen > 15 * 60_000 && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAdmin()
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", user.id)
      .then(({ error }) => error && console.error("[seen]", error.message));
  }

  return toViewer(user.id, user.email ?? undefined, profile, passes, Boolean(tipster));
});

const PROFILE = "email, plan, access_until, stripe_customer_id, pass_credits, bonus_until, referral_code, paused_at, marketing_opt_in, is_admin, last_seen_at, full_name, phone, address1, address2, suburb, state, postcode, dob, discord_name";

/** A member by id, for requests that carry an API key rather than a session. */
export async function viewerById(id: string): Promise<Viewer> {
  const db = supabaseAdmin();
  const [{ data: profile }, { data: passes }, { data: tipster }] = await Promise.all([
    db.from("profiles").select(PROFILE).eq("id", id).maybeSingle(),
    db.from("day_passes").select("date").eq("user_id", id).order("date", { ascending: false }).limit(30),
    db.from("affiliates").select("id").eq("user_id", id).eq("active", true).maybeSingle(),
  ]);
  if (!profile) return ANON;
  return toViewer(id, profile.email ?? undefined, profile, passes, Boolean(tipster));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toViewer(id: string, email: string | undefined, profile: any, passes: { date: unknown }[] | null, tipster: boolean): Viewer {
  const until = profile?.access_until ? new Date(profile.access_until) : undefined;
  const pro = Boolean(until && until.getTime() > Date.now());
  return {
    id,
    email,
    pro,
    plan: pro ? (profile?.plan ?? undefined) : undefined,
    accessUntil: until?.toISOString(),
    paused: Boolean(profile?.paused_at),
    admin: isAdminEmail(email) || Boolean(profile?.is_admin),
    stripeCustomerId: profile?.stripe_customer_id ?? undefined,
    passCredits: profile?.pass_credits ?? 0,
    passDates: (passes ?? []).map((p) => String(p.date)),
    bonusUntil: profile?.bonus_until ?? undefined,
    bonusLive: Boolean(profile?.bonus_until && new Date(profile.bonus_until).getTime() > Date.now()),
    referralCode: profile?.referral_code ?? undefined,
    tipsEmails: Boolean(profile?.marketing_opt_in),
    tipster: Boolean(tipster),
    discordName: profile?.discord_name ?? undefined,
    details: {
      fullName: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
      address1: profile?.address1 ?? "",
      address2: profile?.address2 ?? "",
      suburb: profile?.suburb ?? "",
      state: profile?.state ?? "",
      postcode: profile?.postcode ?? "",
      dob: profile?.dob ? String(profile.dob) : "",
    },
  };
}
