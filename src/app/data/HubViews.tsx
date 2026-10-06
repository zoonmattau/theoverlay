import { connection } from "next/server";

import { ViewsBar } from "./ViewsBar";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";

/** The member's saved Datahub views, under the tabs. Nothing for a visitor. */
export async function HubViews() {
  await connection();
  const viewer = await getViewer();
  if (!viewer.id) return null;
  const { data, error } = await supabaseAdmin().from("hub_views").select("id, name, path, query").eq("user_id", viewer.id).order("created_at");
  // Before the table exists the bar stays away rather than offering a save that fails.
  if (error) return null;
  return <ViewsBar views={(data ?? []) as { id: string; name: string; path: string; query: string }[]} />;
}
