// Removes calls that were published after their race had jumped: from the
// tips ledger and from the stored card, so neither the record nor the site
// shows a tip nobody could have taken. Before 15 Sep 2026 the refresh loop
// re-priced races off the quotes bookmakers leave up after the jump.
// npx tsx --conditions=react-server --env-file=.env.local scripts/prune-late-calls.ts 2026-09-15 [more dates]
import { supabaseAdmin } from "../src/lib/billing/access";
import { readStoredCard, writeStoredCard } from "../src/lib/model/store";

async function prune(date: string) {
  const stored = await readStoredCard(date);
  if (!stored) {
    console.log(date, "no card");
    return;
  }
  const jump = new Map<string, number>();
  for (const m of stored.card.meetings) for (const r of m.races) if (r.jumpTime) jump.set(r.raceId, new Date(r.jumpTime).getTime());

  const db = supabaseAdmin();
  const { data, error } = await db.from("tips").select("id, race_id, tab_number, track, race_number, horse_name, side, published_at, units").eq("date", date).eq("source", "model");
  if (error) throw new Error(error.message);
  const late = (data ?? []).filter((t) => jump.has(t.race_id) && new Date(t.published_at).getTime() > jump.get(t.race_id)!);
  const keys = new Set(late.map((t) => `${t.race_id}:${t.tab_number}`));
  for (const t of late) console.log(` ${date} ${t.track} R${t.race_number} ${t.side} ${t.horse_name}, ${Math.round((new Date(t.published_at).getTime() - jump.get(t.race_id)!) / 60000)} min after the jump, ${t.units ?? 0} units`);

  if (late.length) {
    const { error: del } = await db.from("tips").delete().in("id", late.map((t) => t.id));
    if (del) throw new Error(del.message);
  }

  let stripped = 0;
  for (const m of stored.card.meetings) {
    for (const r of m.races) {
      for (const x of r.runners) {
        if (!keys.has(`${r.raceId}:${x.tabNumber}`) || !x.signal) continue;
        x.signal = undefined;
        x.prime = undefined;
        stripped++;
      }
    }
  }
  const selections = stored.card.selections.filter((s) => !keys.has(`${s.raceId}:${s.tabNumber}`));
  if (stripped || selections.length !== stored.card.selections.length) {
    await writeStoredCard(date, { ...stored.card, selections }, 0);
  }
  console.log(`${date}: ${late.length} ledger rows deleted, ${stripped} calls stripped from the card, ${stored.card.selections.length - selections.length} headline selections dropped`);
}

async function main() {
  const dates = process.argv.slice(2);
  if (dates.length === 0) throw new Error("Give at least one date.");
  for (const d of dates) await prune(d);
}
main();
