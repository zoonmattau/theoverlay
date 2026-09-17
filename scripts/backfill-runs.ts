// Fills the runs table from every entry the horses table holds, in pages.
// npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-runs.ts
import { supabaseAdmin } from "../src/lib/billing/access";
import { rememberRuns, runRowsOf } from "../src/lib/model/runs";
import type { RaceEntry } from "../src/lib/formking/types";
(async () => {
  const db = supabaseAdmin();
  const page = 100;
  let from = 0, horses = 0, runs = 0;
  for (;;) {
    const { data, error } = await db.from("horses").select("id, entry").order("id").range(from, from + page - 1);
    if (error) { console.error(error.message); break; }
    if (!data?.length) break;
    const rows = (data as { id: string; entry: RaceEntry }[]).flatMap((h) => runRowsOf(h.entry, h.id));
    await rememberRuns(rows);
    horses += data.length; runs += rows.length; from += page;
    process.stdout.write(`\r${horses} horses, ${runs} runs`);
    if (data.length < page) break;
  }
  const { count } = await db.from("runs").select("race_id", { count: "exact", head: true });
  console.log(`\nruns table: ${count} rows`);
})();
