"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";

/** Tips emails on or off, from the account page. */
export async function setTipsEmails(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id) return;
  await supabaseAdmin().from("profiles").update({ marketing_opt_in: form.get("on") === "1" }).eq("id", viewer.id);
  revalidatePath("/account");
}

const STATES = new Set(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"]);
const text = (form: FormData, key: string, max = 120) => String(form.get(key) ?? "").trim().slice(0, max);

/** Name, phone, address and birth date from the account page. */
export async function saveDetails(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id) return;
  const state = text(form, "state", 3).toUpperCase();
  const dob = text(form, "dob", 10);
  await supabaseAdmin()
    .from("profiles")
    .update({
      full_name: text(form, "fullName") || null,
      phone: text(form, "phone", 30) || null,
      address1: text(form, "address1") || null,
      address2: text(form, "address2") || null,
      suburb: text(form, "suburb", 80) || null,
      state: STATES.has(state) ? state : null,
      postcode: text(form, "postcode", 4).replace(/\D/g, "") || null,
      dob: /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null,
    })
    .eq("id", viewer.id);
  revalidatePath("/account");
}
