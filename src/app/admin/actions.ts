"use server";

import { revalidatePath } from "next/cache";

import { isAdmin, logEvent } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) throw new Error("Not allowed.");
  return viewer;
}

/** Gift days of the full board, on top of whatever the member has. */
export async function addDays(userId: string, days: number): Promise<void> {
  const admin = await requireAdmin();
  if (!Number.isFinite(days) || days === 0) return;
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("bonus_until").eq("id", userId).maybeSingle();
  const base = data?.bonus_until && new Date(data.bonus_until).getTime() > Date.now() ? new Date(data.bonus_until) : new Date();
  const until = new Date(base.getTime() + days * 86400_000);
  await db.from("profiles").update({ bonus_until: until.toISOString() }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "admin", plan: null, amount_cents: null, meta: { action: "add_days", days, by: admin.email } });
  revalidatePath(`/admin/${userId}`);
}

/** Pause: Stripe stops billing and the board closes until resumed. */
export async function pauseMember(userId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("stripe_subscription_id").eq("id", userId).maybeSingle();
  if (stripeConfigured() && data?.stripe_subscription_id) {
    await stripe().subscriptions.update(data.stripe_subscription_id, { pause_collection: { behavior: "void" } });
  }
  await db.from("profiles").update({ paused_at: new Date().toISOString() }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "admin", plan: null, amount_cents: null, meta: { action: "pause", by: admin.email } });
  revalidatePath(`/admin/${userId}`);
}

export async function resumeMember(userId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("stripe_subscription_id").eq("id", userId).maybeSingle();
  if (stripeConfigured() && data?.stripe_subscription_id) {
    await stripe().subscriptions.update(data.stripe_subscription_id, { pause_collection: "" });
  }
  await db.from("profiles").update({ paused_at: null }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "admin", plan: null, amount_cents: null, meta: { action: "resume", by: admin.email } });
  revalidatePath(`/admin/${userId}`);
}

/** Cancel at the end of the paid period; the webhook closes access then. */
export async function cancelMember(userId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("stripe_subscription_id").eq("id", userId).maybeSingle();
  if (stripeConfigured() && data?.stripe_subscription_id) {
    await stripe().subscriptions.update(data.stripe_subscription_id, { cancel_at_period_end: true });
  }
  await logEvent({ user_id: userId, kind: "admin", plan: null, amount_cents: null, meta: { action: "cancel", by: admin.email } });
  revalidatePath(`/admin/${userId}`);
}

export async function addPasses(userId: string, qty: number): Promise<void> {
  const admin = await requireAdmin();
  if (!Number.isInteger(qty) || qty === 0) return;
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("pass_credits").eq("id", userId).maybeSingle();
  await db.from("profiles").update({ pass_credits: Math.max(0, (data?.pass_credits ?? 0) + qty) }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "admin", plan: null, amount_cents: null, meta: { action: "add_passes", qty, by: admin.email } });
  revalidatePath(`/admin/${userId}`);
}

export async function saveNote(userId: string, note: string): Promise<void> {
  await requireAdmin();
  await supabaseAdmin().from("profiles").update({ admin_note: note.slice(0, 2000) }).eq("id", userId);
  revalidatePath(`/admin/${userId}`);
}
