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
