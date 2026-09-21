import "server-only";

import { supabaseAdmin } from "./billing/access";
import type { Viewer } from "./auth";

export const isAdmin = (viewer: Viewer): boolean => viewer.admin;

export interface Member {
  id: string;
  email: string | null;
  plan: string | null;
  access_until: string | null;
  subscription_status: string | null;
  /** When a cancellation is booked to take effect, if one is; the member keeps access until then. */
  cancel_at: string | null;
  cancel_reason: string | null;
  subscribed_since: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  total_spent_cents: number;
  pass_credits: number;
  bonus_until: string | null;
  paused_at: string | null;
  marketing_opt_in: boolean;
  referral_code: string | null;
  admin_note: string | null;
  is_admin: boolean;
  last_seen_at: string | null;
  full_name: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  dob: string | null;
  source: string | null;
  /** First visit: the page they landed on, the site that sent them, campaign tags. */
  landing: string | null;
  referrer: string | null;
  utm: Record<string, string> | null;
  affiliate_id: string | null;
  /** The Discord account they linked from Account, if any. */
  discord_id: string | null;
  discord_name: string | null;
  discord_linked_at: string | null;
  created_at: string;
  /** From auth: when the invite went out, when the address was confirmed, last log in. */
  invited_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
}

/** Invited and never logged in, signed up but never confirmed, or in. */
export function accountState(m: Member): "invited" | "unconfirmed" | "active" {
  if (m.last_sign_in_at) return "active";
  if (m.invited_at) return "invited";
  return m.confirmed_at ? "active" : "unconfirmed";
}

/** The auth side of every account, keyed by id. */
async function authUsers(): Promise<Map<string, Pick<Member, "invited_at" | "confirmed_at" | "last_sign_in_at">>> {
  const out = new Map<string, Pick<Member, "invited_at" | "confirmed_at" | "last_sign_in_at">>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("[admin] listUsers", error.message);
      break;
    }
    for (const u of data.users) {
      out.set(u.id, {
        invited_at: u.invited_at ?? null,
        confirmed_at: u.email_confirmed_at ?? u.confirmed_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

export interface Event {
  id: number;
  user_id: string | null;
  kind: string;
  plan: string | null;
  amount_cents: number | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

const MEMBER_COLS =
  "id, email, plan, access_until, subscription_status, cancel_at, cancel_reason, subscribed_since, stripe_customer_id, stripe_subscription_id, total_spent_cents, pass_credits, bonus_until, paused_at, marketing_opt_in, referral_code, admin_note, is_admin, last_seen_at, full_name, phone, address1, address2, suburb, state, postcode, dob, source, landing, referrer, utm, affiliate_id, discord_id, discord_name, discord_linked_at, created_at";

export async function listMembers(search?: string): Promise<Member[]> {
  let q = supabaseAdmin().from("profiles").select(MEMBER_COLS).order("created_at", { ascending: false }).limit(500);
  if (search) q = q.or(`email.ilike.%${search}%,full_name.ilike.%${search}%,phone.ilike.%${search}%,suburb.ilike.%${search}%`);
  const [{ data }, auth] = await Promise.all([q, authUsers()]);
  return ((data ?? []) as Member[]).map((m) => ({ ...m, ...auth.get(m.id) }));
}

export async function getMember(id: string): Promise<Member | undefined> {
  const [{ data }, { data: auth }] = await Promise.all([
    supabaseAdmin().from("profiles").select(MEMBER_COLS).eq("id", id).maybeSingle(),
    supabaseAdmin().auth.admin.getUserById(id),
  ]);
  if (!data) return undefined;
  const u = auth?.user;
  return {
    ...(data as Member),
    invited_at: u?.invited_at ?? null,
    confirmed_at: u?.email_confirmed_at ?? u?.confirmed_at ?? null,
    last_sign_in_at: u?.last_sign_in_at ?? null,
  };
}

export async function memberEvents(id: string, limit = 50): Promise<Event[]> {
  const { data } = await supabaseAdmin().from("events").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as Event[];
}

export async function recentEvents(kind?: string, limit = 100): Promise<Event[]> {
  let q = supabaseAdmin().from("events").select("*").order("created_at", { ascending: false }).limit(limit);
  // Page views have their own page; they would drown everything else here.
  q = kind ? q.eq("kind", kind) : q.neq("kind", "page_view");
  const { data } = await q;
  return (data ?? []) as Event[];
}

/** Never throws: an event log must not break a checkout or a webhook. */
export async function logEvent(e: Omit<Event, "id" | "created_at">): Promise<void> {
  try {
    const { error } = await supabaseAdmin().from("events").insert(e);
    if (error) console.error("[events]", error.message);
  } catch (err) {
    console.error("[events]", err);
  }
}

/** Adds a payment to the member's running total and logs it. */
export async function recordPayment(userId: string, cents: number, plan: string | null, meta: Record<string, unknown>): Promise<void> {
  if (!(cents > 0)) return;
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("total_spent_cents").eq("id", userId).maybeSingle();
  await db.from("profiles").update({ total_spent_cents: (data?.total_spent_cents ?? 0) + cents }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "payment", plan, amount_cents: cents, meta });
}

export async function referralsMade(id: string): Promise<number> {
  const { count } = await supabaseAdmin().from("referrals").select("*", { count: "exact", head: true }).eq("referrer_id", id);
  return count ?? 0;
}

/** Server components cannot call Date.now() in render, so the clock lives here. */
export const now = () => Date.now();

/** The overview numbers. */
export async function overview(members?: Member[]) {
  members ??= await listMembers();
  const now = Date.now();
  const active = members.filter((m) => m.access_until && new Date(m.access_until).getTime() > now && !m.paused_at);
  const byPlan: Record<string, number> = {};
  for (const m of active) byPlan[m.plan ?? "?"] = (byPlan[m.plan ?? "?"] ?? 0) + 1;
  const trialling = active.filter((m) => m.subscription_status === "trialing").length;
  const revenue = members.reduce((a, m) => a + (m.total_spent_cents ?? 0), 0);
  const week = new Date(now - 7 * 86400_000).toISOString();
  const { data: clicks } = await supabaseAdmin().from("events").select("plan").eq("kind", "plan_click").gte("created_at", week);
  const clicksByPlan: Record<string, number> = {};
  for (const c of clicks ?? []) clicksByPlan[c.plan ?? "?"] = (clicksByPlan[c.plan ?? "?"] ?? 0) + 1;
  const signupsWeek = members.filter((m) => m.created_at >= week).length;
  return { members: members.length, active: active.length, byPlan, trialling, revenue, clicksByPlan, signupsWeek };
}
