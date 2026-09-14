"use server";

import { revalidatePath } from "next/cache";

import { isAdmin, logEvent } from "@/lib/admin";
import { cleanCode } from "@/lib/affiliates";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) throw new Error("Not allowed.");
  return viewer;
}

export async function createAffiliate(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const code = cleanCode(String(form.get("code") ?? "")) || cleanCode(name.replace(/\s+/g, ""));
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 120) || null;
  const pct = Math.min(100, Math.max(0, Number(form.get("pct") ?? 20) || 0));
  if (!name || !code) return;
  // A login email makes them a tipster straight away.
  const login = String(form.get("login") ?? "").trim().toLowerCase();
  let userId: string | null = null;
  if (login) {
    const { data } = await supabaseAdmin().from("profiles").select("id").eq("email", login).maybeSingle();
    userId = data?.id ?? null;
  }
  const { error } = await supabaseAdmin().from("affiliates").insert({ code, name, email, commission_pct: pct, user_id: userId });
  await logEvent({ user_id: null, kind: "admin", plan: null, amount_cents: null, meta: { action: "affiliate_create", code, name, error: error?.message, by: admin.email } });
  revalidatePath("/admin/affiliates");
}

export async function toggleAffiliate(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  await supabaseAdmin().from("affiliates").update({ active }).eq("id", id);
  revalidatePath("/admin/affiliates");
}

export async function updateAffiliate(id: string, form: FormData): Promise<void> {
  await requireAdmin();
  const pct = Math.min(100, Math.max(0, Number(form.get("pct") ?? 20) || 0));
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000) || null;
  await supabaseAdmin().from("affiliates").update({ commission_pct: pct, notes }).eq("id", id);
  revalidatePath("/admin/affiliates");
}

/** Links a login to an affiliate so they can post tips at /tipster. Empty unlinks. */
export async function linkTipster(id: string, form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const db = supabaseAdmin();
  let userId: string | null = null;
  if (email) {
    const { data } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!data) return;
    userId = data.id;
  }
  const { error } = await db.from("affiliates").update({ user_id: userId }).eq("id", id);
  await logEvent({ user_id: userId, kind: "admin", plan: null, amount_cents: null, meta: { action: "tipster_link", affiliate: id, email, error: error?.message, by: admin.email } });
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
