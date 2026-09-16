import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";

/** The reactions a member can leave on a tipster's call, in the order the bar shows them. */
export const REACTIONS = [
  { key: "fire", emoji: "🔥", label: "On fire" },
  { key: "nod", emoji: "👍", label: "With you" },
  { key: "target", emoji: "🎯", label: "Nailed it" },
  { key: "eyes", emoji: "👀", label: "Watching" },
] as const;
export type ReactionKey = (typeof REACTIONS)[number]["key"];

export interface TipReactions {
  counts: Record<ReactionKey, number>;
  /** The viewer's own. */
  mine: ReactionKey[];
}

const empty = (): TipReactions => ({ counts: { fire: 0, nod: 0, target: 0, eyes: 0 }, mine: [] });

/** Reaction counts for a set of calls, with the viewer's own marked. */
export async function reactionsFor(tipIds: number[], viewerId?: string): Promise<Map<number, TipReactions>> {
  const out = new Map<number, TipReactions>();
  if (tipIds.length === 0) return out;
  const { data } = await supabaseAdmin().from("tip_reactions").select("tip_id, user_id, emoji").in("tip_id", tipIds);
  for (const r of (data ?? []) as { tip_id: number; user_id: string; emoji: ReactionKey }[]) {
    const t = out.get(r.tip_id) ?? empty();
    t.counts[r.emoji] = (t.counts[r.emoji] ?? 0) + 1;
    if (viewerId && r.user_id === viewerId) t.mine.push(r.emoji);
    out.set(r.tip_id, t);
  }
  return out;
}

/** Adds or removes one reaction for one member; returns whether it is on afterwards. */
export async function toggleReaction(tipId: number, userId: string, emoji: ReactionKey): Promise<boolean> {
  const db = supabaseAdmin();
  const { data } = await db.from("tip_reactions").select("tip_id").eq("tip_id", tipId).eq("user_id", userId).eq("emoji", emoji).maybeSingle();
  if (data) {
    await db.from("tip_reactions").delete().eq("tip_id", tipId).eq("user_id", userId).eq("emoji", emoji);
    return false;
  }
  await db.from("tip_reactions").insert({ tip_id: tipId, user_id: userId, emoji });
  return true;
}
