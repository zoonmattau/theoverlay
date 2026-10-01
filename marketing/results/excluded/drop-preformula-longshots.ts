// Drops the $10+ bets called 11 to 15 Sep 2026 from the tips ledger. Our
// ratings over-priced long shots until the meld went in on 15 Sep (1e34ee4),
// so those calls were never the method's. Every row is written to
// tips-2026-09-11-15.json first; restore-preformula-longshots.ts puts them back.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/results/excluded/drop-preformula-longshots.ts [--apply]
import { writeFileSync } from "node:fs";
import { supabaseAdmin } from "../../../src/lib/billing/access";

const OUT = "marketing/results/excluded/tips-2026-09-11-15.json";
(async () => {
  const apply = process.argv.includes("--apply");
  const db = supabaseAdmin();
  const { data, error } = await db.from("tips").select("*").eq("source", "model").eq("side", "back").gte("date", "2026-09-11").lte("date", "2026-09-15").gte("market_price", 10).order("date").order("id");
  if (error) throw error;
  const rows = data ?? [];
  const units = rows.reduce((s, r) => s + Number(r.units ?? 0), 0);
  console.log(`${rows.length} bets at $10+ from 11 to 15 Sep: ${rows.filter((r) => Number(r.units) > 0).length} won, ${rows.filter((r) => r.finish_position === null).length} void, ${units.toFixed(2)}u`);
  for (const r of rows) console.log(`  ${r.date} ${r.track} R${r.race_number} ${r.tab_number}. ${r.horse_name} $${r.market_price} ${r.units ?? "unsettled"}`);
  if (!apply) return console.log("dry run: pass --apply to back up and delete");
  writeFileSync(OUT, JSON.stringify(rows, null, 1));
  const { error: del, count } = await db.from("tips").delete({ count: "exact" }).in("id", rows.map((r) => r.id));
  if (del) throw del;
  console.log(`backed up to ${OUT}, deleted ${count}`);
})();
