// Removes calls a model change left under the full threshold. A published
// call normally stays while it keeps half the threshold, so a price move does
// not make it flicker off between refreshes; when the ratings themselves
// change, that carries over calls the new model would never have made. Takes
// them off the stored card and out of the tips ledger, so the next rebuild
// does not carry them either.
// npx tsx --conditions=react-server --env-file=.env.local scripts/prune-thin-calls.ts 2026-09-16
import { supabaseAdmin } from "../src/lib/billing/access";
import { LAY_EDGE, MIN_EDGE, ratingRank } from "../src/lib/model/publish";
import { explain } from "../src/lib/model/ratings";
import { readStoredCard, writeStoredCard } from "../src/lib/model/store";

async function prune(date: string) {
  const stored = await readStoredCard(date);
  if (!stored) {
    console.log(date, "no card");
    return;
  }
  const keys = new Set<string>();
  let stripped = 0;
  for (const m of stored.card.meetings) {
    for (const r of m.races) {
      for (const x of r.runners) {
        if (!x.signal || x.edge === undefined) continue;
        const thin = x.signal === "back" ? x.edge < MIN_EDGE : (x.layEdge ?? x.edge) > LAY_EDGE;
        if (!thin) continue;
        console.log(` ${date} ${m.track} R${r.raceNumber} ${x.signal} ${x.horseName}, ${(x.edge * 100).toFixed(1)} points`);
        keys.add(`${r.raceId}:${x.tabNumber}`);
        x.signal = undefined;
        x.prime = undefined;
        if (x.rank) x.why = explain(x.ratings, ratingRank(r.runners, x), { going: r.going, tempo: r.pace.tempo }, undefined);
        stripped++;
      }
    }
  }
  const db = supabaseAdmin();
  const { data, error } = await db.from("tips").select("id, race_id, tab_number").eq("date", date).eq("source", "model");
  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter((t) => keys.has(`${t.race_id}:${t.tab_number}`));
  if (rows.length) {
    const { error: del } = await db.from("tips").delete().in("id", rows.map((t) => t.id));
    if (del) throw new Error(del.message);
  }
  const selections = stored.card.selections.filter((s) => !keys.has(`${s.raceId}:${s.tabNumber}`));
  if (stripped) await writeStoredCard(date, { ...stored.card, selections }, 0);
  console.log(`${date}: ${stripped} calls stripped from the card, ${rows.length} ledger rows deleted, ${stored.card.selections.length - selections.length} selections dropped`);
}

async function main() {
  const dates = process.argv.slice(2);
  if (dates.length === 0) throw new Error("Give at least one date.");
  for (const d of dates) await prune(d);
}
main();
