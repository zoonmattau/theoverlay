"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";

async function admin() {
  if (!isAdmin(await getViewer())) notFound();
}

/** A cost line from the Money tab: date, dollars, what it was, and whether it repeats monthly. */
export async function addCost(form: FormData): Promise<void> {
  await admin();
  const date = String(form.get("date") ?? "");
  const dollars = Number(String(form.get("amount") ?? "").replace(/[$,\s]/g, ""));
  const what = String(form.get("what") ?? "").trim().slice(0, 120);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(dollars > 0) || !what) return;
  await supabaseAdmin().from("costs").insert({ date, amount_cents: Math.round(dollars * 100), what, monthly: form.get("monthly") === "on" });
  revalidatePath("/admin/money");
}

/** Stops a monthly line: this month is the last it counts. */
export async function stopCost(form: FormData): Promise<void> {
  await admin();
  const month = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  await supabaseAdmin().from("costs").update({ stopped: month }).eq("id", String(form.get("id")));
  revalidatePath("/admin/money");
}

/** Removes a line typed in by mistake. */
export async function removeCost(form: FormData): Promise<void> {
  await admin();
  await supabaseAdmin().from("costs").delete().eq("id", String(form.get("id")));
  revalidatePath("/admin/money");
}
