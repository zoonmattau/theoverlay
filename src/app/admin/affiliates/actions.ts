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
  const { error } = await supabaseAdmin().from("affiliates").insert({ code, name, email, commission_pct: pct });
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
