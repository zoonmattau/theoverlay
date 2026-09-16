"use server";

import { getViewer } from "@/lib/auth";
import { REACTIONS, toggleReaction, type ReactionKey } from "@/lib/reactions";

/** A signed-in member toggles one reaction on a tipster's call. */
export async function react(tipId: number, emoji: string): Promise<{ on: boolean } | { error: string }> {
  const viewer = await getViewer();
  if (!viewer.id) return { error: "Log in to react." };
  if (!Number.isInteger(tipId) || !REACTIONS.some((r) => r.key === emoji)) return { error: "Not a reaction." };
  return { on: await toggleReaction(tipId, viewer.id, emoji as ReactionKey) };
}
