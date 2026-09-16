"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { settleByHand } from "@/lib/model/settle";

export interface SettleState {
  error?: string;
  done?: string;
}

/** An admin settles a race by hand from its page. */
export async function settleRace(_prev: SettleState, form: FormData): Promise<SettleState> {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return { error: "Not allowed." };
  const date = String(form.get("date") ?? "");
  const raceId = String(form.get("raceId") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !raceId) return { error: "Bad race." };
  const order = ["first", "second", "third", "fourth"].map((k) => Number(form.get(k))).filter((n) => n > 0);
  const r = await settleByHand(date, raceId, order);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/racing/${date}/${form.get("meetingId")}/${raceId}`);
  revalidatePath("/tips");
  revalidatePath("/");
  return { done: `${r.track} R${r.raceNumber} settled.` };
}
