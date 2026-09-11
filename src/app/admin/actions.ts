"use server";

import { revalidatePath } from "next/cache";

import { isAdmin, logEvent } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";
import { EMAILS } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";
import { sendMorningTips } from "@/lib/email/tips";
import { buildCard, racingToday } from "@/lib/model/source";

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

/** Rebuild today's card from Form King right now. */
export async function rebuildCard(): Promise<void> {
  const admin = await requireAdmin();
  const date = racingToday();
  const { card, seconds } = await buildCard(date);
  const races = card.meetings.reduce((a, m) => a + m.races.length, 0);
  await logEvent({ user_id: null, kind: "admin", plan: null, amount_cents: null, meta: { action: "rebuild_card", date, races, seconds, by: admin.email } });
  revalidatePath("/admin");
}

/** Send the morning tips email again, to everyone who qualifies today. */
export async function resendTips(): Promise<void> {
  const admin = await requireAdmin();
  const date = racingToday();
  const { card } = await buildCard(date);
  const { sent } = await sendMorningTips(date, card, true);
  await logEvent({ user_id: null, kind: "admin", plan: null, amount_cents: null, meta: { action: "resend_tips", date, sent, by: admin.email } });
  revalidatePath("/admin");
}

/** Admin on or off for a member; you cannot take your own away. */
export async function setAdmin(userId: string, on: boolean): Promise<void> {
  const admin = await requireAdmin();
  if (!on && admin.id === userId) return;
  await supabaseAdmin().from("profiles").update({ is_admin: on }).eq("id", userId);
  await logEvent({ user_id: userId, kind: "admin", plan: null, amount_cents: null, meta: { action: on ? "make_admin" : "remove_admin", by: admin.email } });
  revalidatePath(`/admin/${userId}`);
  revalidatePath("/admin");
}

/**
 * Creates an account for someone and emails them a one-time link that sets
 * their password, on our domain through Resend. Optional gift days and admin.
 */
export async function inviteMember(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const days = Math.max(0, Number(form.get("days") ?? 0) || 0);
  const makeAdmin = form.get("admin") === "on";
  if (!email.includes("@")) return;
  const db = supabaseAdmin();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";

  const { data, error } = await db.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { accepted_terms: "true", marketing_opt_in: true }, redirectTo: `${site}/auth/confirm` },
  });
  if (error || !data.user) {
    await logEvent({ user_id: null, kind: "admin", plan: null, amount_cents: null, meta: { action: "invite_failed", email, error: error?.message, by: admin.email } });
    revalidatePath("/admin");
    return;
  }
  const userId = data.user.id;
  const link = `${site}/auth/confirm?token_hash=${data.properties.hashed_token}&type=invite&next=${encodeURIComponent("/reset?welcome=1")}`;

  const patch: Record<string, unknown> = { email, marketing_opt_in: true };
  if (makeAdmin) patch.is_admin = true;
  if (days > 0) patch.bonus_until = new Date(Date.now() + days * 86400_000).toISOString();
  await db.from("profiles").upsert({ id: userId, ...patch });

  const ok = await sendEmail(email, EMAILS.invited(link, days, makeAdmin));
  await logEvent({ user_id: userId, kind: "admin", plan: null, amount_cents: null, meta: { action: "invite", email, days, admin: makeAdmin, emailed: ok, by: admin.email } });
  revalidatePath("/admin");
}
