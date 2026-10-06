"use server";

import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";

const MAX_VIEWS = 50;

/** Save the Datahub page as it stands under a name; the same name on the same account is replaced. */
export async function saveView(name: string, path: string, query: string): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  if (!viewer.id) return { ok: false, error: "Log in to save a view." };
  const label = name.trim().slice(0, 60);
  if (!label) return { ok: false, error: "Give the view a name." };
  if (!/^\/data(\/|$)/.test(path)) return { ok: false, error: "Only Datahub pages can be saved." };
  const db = supabaseAdmin();
  const { count } = await db.from("hub_views").select("id", { count: "exact", head: true }).eq("user_id", viewer.id);
  await db.from("hub_views").delete().eq("user_id", viewer.id).eq("name", label);
  if ((count ?? 0) >= MAX_VIEWS) return { ok: false, error: `Up to ${MAX_VIEWS} views; delete one first.` };
  const { error } = await db.from("hub_views").insert({ user_id: viewer.id, name: label, path: path.slice(0, 200), query: query.slice(0, 4000) });
  return error ? { ok: false, error: "Could not save the view." } : { ok: true };
}

export async function deleteView(id: string): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.id) return;
  await supabaseAdmin().from("hub_views").delete().eq("id", id).eq("user_id", viewer.id);
}
