// Takes a call off by hand for the rest of the day: the runner is muted for every rebuild, the
// stored card loses the call now, and its open ledger row goes.
// npx tsx --conditions=react-server --env-file=.env.local scripts/mute-call.ts 2026-09-18 "Aethelwulf" [--unmute]
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "../src/lib/billing/access";
import { readMutes, readStoredCard, writeMutes } from "../src/lib/model/store";

const [date, name, flag] = process.argv.slice(2);
(async () => {
  const db = supabaseAdmin();
  const stored = await readStoredCard(date);
  if (!stored) throw new Error(`no card for ${date}`);
  const hits: { raceId: string; tab: number; track: string; race: number; signal?: string }[] = [];
  for (const m of stored.card.meetings) for (const r of m.races) for (const x of r.runners) if (x.horseName.toLowerCase() === name.toLowerCase()) hits.push({ raceId: r.raceId, tab: x.tabNumber, track: m.track, race: r.raceNumber, signal: x.signal });
  if (hits.length !== 1) throw new Error(`${hits.length} runners called ${name} on ${date}`);
  const [h] = hits;
  const key = `${h.raceId}:${h.tab}`;
  const mutes = await readMutes(date);
  if (flag === "--unmute") {
    mutes.delete(key);
    await writeMutes(date, mutes);
    console.log(`${name} (${h.track} R${h.race}) unmuted; the next rebuild decides.`);
    return;
  }
  mutes.add(key);
  await writeMutes(date, mutes);
  // The stored card now, so the site does not wait for a rebuild.
  for (const m of stored.card.meetings) for (const r of m.races) for (const x of r.runners) if (r.raceId === h.raceId && x.tabNumber === h.tab) { x.signal = undefined; x.prime = undefined; }
  stored.card.selections = stored.card.selections.filter((s) => !(s.raceId === h.raceId && s.tabNumber === h.tab));
  const { error } = await db.from("cards").update({ card: stored.card }).eq("date", date);
  if (error) throw error;
  const { data: gone, error: del } = await db.from("tips").delete().eq("date", date).eq("source", "model").eq("race_id", h.raceId).eq("tab_number", h.tab).is("settled_at", null).select("id");
  if (del) throw del;
  try { revalidateTag(`card-${date}`, "max"); } catch { /* outside a request the cache is not ours to clear; the next build does it */ }
  console.log(`${name} (${h.track} R${h.race}) was ${h.signal ?? "not a call"}: muted for ${date}, ${gone?.length ?? 0} ledger row(s) removed.`);
})();
