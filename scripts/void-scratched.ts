// Settles as a void every open call, ours and the tipsters', whose runner the
// stored card has scratched: the ledgers did this from 23 Sep 2026, and the
// calls before it sat open for good. Dry run unless --write.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/void-scratched.ts [--write]
import { supabaseAdmin } from "../src/lib/billing/access";
import { readStoredCard } from "../src/lib/model/store";
import { voidSettlement } from "../src/lib/tips";

void (async () => {
  const write = process.argv.includes("--write");
  const db = supabaseAdmin();
  const [{ data: ours }, { data: theirs }] = await Promise.all([
    db.from("tips").select("id, date, race_id, tab_number, horse_name, side").eq("source", "model").is("settled_at", null),
    db.from("creator_tips").select("id, date, race_id, tab_number, horse_name, side").is("settled_at", null),
  ]);
  const cards = new Map<string, Awaited<ReturnType<typeof readStoredCard>>>();
  const scratched = async (date: string, raceId: string, tab: number) => {
    if (!cards.has(date)) cards.set(date, await readStoredCard(date));
    const race = cards.get(date)?.card.meetings.flatMap((m) => m.races).find((r) => r.raceId === raceId);
    return Boolean(race?.runners.find((x) => x.tabNumber === tab)?.scratched);
  };
  for (const [table, rows] of [["tips", ours], ["creator_tips", theirs]] as const) {
    for (const t of (rows ?? []) as { id: number; date: string; race_id: string; tab_number: number; horse_name: string; side: string }[]) {
      if (!(await scratched(t.date, t.race_id, t.tab_number))) continue;
      console.log(`${write ? "void" : "would void"} ${table} ${t.date} ${t.race_id} #${t.tab_number} ${t.horse_name} (${t.side})`);
      if (write) {
        const { error } = await db.from(table).update(voidSettlement()).eq("id", t.id);
        if (error) console.error(error.message);
      }
    }
  }
})();
