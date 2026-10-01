// Puts the $10+ bets from 11 to 15 Sep 2026 back on the ledger, from the
// backup drop-preformula-longshots.ts wrote. Take them out of EXCLUDED_CALLS
// in src/lib/tips/excluded.ts as well, or a re-settle will skip them again.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/results/excluded/restore-preformula-longshots.ts
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../../../src/lib/billing/access";

(async () => {
  const rows = JSON.parse(readFileSync("marketing/results/excluded/tips-2026-09-11-15.json", "utf8")) as Record<string, unknown>[];
  // The id column is generated, so the rows go back with new ids.
  const { error, count } = await supabaseAdmin().from("tips").insert(rows.map(({ id: _id, ...r }) => r), { count: "exact" });
  if (error) throw error;
  console.log(`restored ${count} of ${rows.length}`);
})();
