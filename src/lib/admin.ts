import "server-only";

import { supabaseAdmin } from "./billing/access";
import type { Viewer } from "./auth";

/** Comma-separated in ADMIN_EMAILS. */
export function isAdmin(viewer: Viewer): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Boolean(viewer.email && list.includes(viewer.email.toLowerCase()));
}

export interface Member {
  id: string;
  email: string | null;
  plan: string | null;
  access_until: string | null;
  subscription_status: string | null;
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
  created_at: string;
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
  "id, email, plan, access_until, subscription_status, subscribed_since, stripe_customer_id, stripe_subscription_id, total_spent_cents, pass_credits, bonus_until, paused_at, marketing_opt_in, referral_code, admin_note, created_at";

export async function listMembers(search?: string): Promise<Member[]> {
  let q = supabaseAdmin().from("profiles").select(MEMBER_COLS).order("created_at", { ascending: false }).limit(500);
  if (search) q = q.ilike("email", `%${search}%`);
  const { data } = await q;
  return (data ?? []) as Member[];
}

export async function getMember(id: string): Promise<Member | undefined> {
  const { data } = await supabaseAdmin().from("profiles").select(MEMBER_COLS).eq("id", id).maybeSingle();
  return (data as Member | null) ?? undefined;
}

export async function memberEvents(id: string, limit = 50): Promise<Event[]> {
  const { data } = await supabaseAdmin().from("events").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as Event[];
}

export async function recentEvents(kind?: string, limit = 100): Promise<Event[]> {
  let q = supabaseAdmin().from("events").select("*").order("created_at", { ascending: false }).limit(limit);
  if (kind) q = q.eq("kind", kind);
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
export async function overview() {
  const members = await listMembers();
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
