"use server";

import { revalidatePath } from "next/cache";

import { isAdmin, logEvent } from "@/lib/admin";
import { cleanCode } from "@/lib/affiliates";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { EMAILS } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) throw new Error("Not allowed.");
  return viewer;
}

/**
 * A new affiliate from scratch: the code and rate, and an account on the
 * same email, invited if it does not exist yet, so they can post tips and
 * see their sign-ups the moment they set a password.
 */
export async function createAffiliate(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const code = cleanCode(String(form.get("code") ?? "")) || cleanCode(name.replace(/s+/g, ""));
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 120);
  const pct = Math.min(100, Math.max(0, Number(form.get("pct") ?? 40) || 0));
  if (!name || !code || !email.includes("@")) return;
  const db = supabaseAdmin();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";

  // Their account: the one they already have, or a fresh invite.
  let userId: string | null = null;
  let invited = false;
  const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) userId = existing.id;
  else {
    const { data, error } = await db.auth.admin.generateLink({
      type: "invite",
      email,
      options: { data: { accepted_terms: "true", marketing_opt_in: true, full_name: name }, redirectTo: `${site}/auth/confirm` },
    });
    if (error || !data.user) {
      await logEvent({ user_id: null, kind: "admin", plan: null, amount_cents: null, meta: { action: "affiliate_invite_failed", email, error: error?.message, by: admin.email } });
      revalidatePath("/admin/affiliates");
      return;
    }
    userId = data.user.id;
    await db.from("profiles").upsert({ id: userId, email, marketing_opt_in: true, full_name: name });
    const link = `${site}/auth/confirm?token_hash=${data.properties.hashed_token}&type=invite&next=${encodeURIComponent("/reset?welcome=1")}`;
    invited = await sendEmail(email, EMAILS.invitedAffiliate(link, name, code));
  }

  const { data: made, error } = await db.from("affiliates").insert({ code, name, email, commission_pct: pct, user_id: userId }).select("id").maybeSingle();
  // A tipster follows themselves, so their own calls are marked for them like anyone's.
  if (made && userId) await db.from("follows").upsert({ user_id: userId, tipster_id: made.id }, { onConflict: "user_id,tipster_id" });
  await logEvent({ user_id: userId, kind: "admin", plan: null, amount_cents: null, meta: { action: "affiliate_create", code, name, email, invited, error: error?.message, by: admin.email } });
  revalidatePath("/admin/affiliates");
  revalidatePath("/admin/members");
}

/** Removes the affiliate for good, clicks and payouts with it, and the account that was theirs. */
export async function deleteAffiliate(id: string): Promise<void> {
  const admin = await requireAdmin();
  const db = supabaseAdmin();
  const { data: a } = await db.from("affiliates").select("code, user_id").eq("id", id).maybeSingle();
  if (!a) return;
  if (a.user_id === admin.id) return;
  await db.from("affiliates").delete().eq("id", id);
  if (a.user_id) {
    await db.auth.admin.deleteUser(a.user_id);
    await db.from("profiles").delete().eq("id", a.user_id);
  }
  await logEvent({ user_id: null, kind: "admin", plan: null, amount_cents: null, meta: { action: "delete_affiliate", code: a.code, account: Boolean(a.user_id), by: admin.email } });
  revalidatePath("/admin/affiliates");
  revalidatePath("/admin/members");
}

export async function toggleAffiliate(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  await supabaseAdmin().from("affiliates").update({ active }).eq("id", id);
  revalidatePath("/admin/affiliates");
}

/** Shows a tipster to members, or takes them off public view while they still post. */
export async function toggleListed(id: string, listed: boolean): Promise<void> {
  await requireAdmin();
  const { data } = await supabaseAdmin().from("affiliates").update({ listed }).eq("id", id).select("code").maybeSingle();
  revalidatePath("/admin/affiliates");
  revalidatePath("/tipsters");
  if (data?.code) revalidatePath(`/t/${data.code}`);
}

export async function updateAffiliate(id: string, form: FormData): Promise<void> {
  await requireAdmin();
  const pct = Math.min(100, Math.max(0, Number(form.get("pct") ?? 20) || 0));
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000) || null;
  await supabaseAdmin().from("affiliates").update({ commission_pct: pct, notes }).eq("id", id);
  revalidatePath("/admin/affiliates");
}

/** Records a month's commission as paid, at the amount owed unless told otherwise. */
export async function markPaid(affiliateId: string, month: string, form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const cents = Math.round(Number(form.get("amount")) * 100);
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  if (!/^\d{4}-\d{2}$/.test(month) || !(cents >= 0)) return;
  await supabaseAdmin().from("affiliate_payouts").upsert({ affiliate_id: affiliateId, month, amount_cents: cents, note, paid_at: new Date().toISOString() }, { onConflict: "affiliate_id,month" });
  await logEvent({ user_id: null, kind: "admin", plan: null, amount_cents: cents, meta: { action: "affiliate_paid", affiliate: affiliateId, month, by: admin.email } });
  revalidatePath("/admin/affiliates");
}

export async function unmarkPaid(affiliateId: string, month: string): Promise<void> {
  await requireAdmin();
  await supabaseAdmin().from("affiliate_payouts").delete().eq("affiliate_id", affiliateId).eq("month", month);
  revalidatePath("/admin/affiliates");
}
