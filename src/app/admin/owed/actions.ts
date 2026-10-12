"use server";

import { revalidatePath } from "next/cache";

import { isAdmin, logEvent } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";

/** A monthly bill (Form King, BetWatch) marked paid for a month, or the mark taken off. */
export async function setBillPaid(costId: string, month: string, paid: boolean): Promise<void> {
  const viewer = await getViewer();
  if (!isAdmin(viewer) || !/^\d{4}-\d{2}$/.test(month)) return;
  const db = supabaseAdmin();
  await db.from("events").delete().eq("kind", "bill_paid").eq("meta->>cost", costId).eq("meta->>month", month);
  if (paid) await logEvent({ user_id: null, kind: "bill_paid", plan: null, amount_cents: null, meta: { cost: costId, month, by: viewer.email } });
  revalidatePath("/admin/owed");
}
