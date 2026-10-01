// Pulls every model call from the tips table: npx tsx --conditions=react-server --env-file=.env.local marketing/results/build/dump-tips.ts marketing/results/build/tips.json
import { writeFileSync } from "node:fs";
import { supabaseAdmin } from "M:/projects/overlay/src/lib/billing/access";
(async () => {
  const db = supabaseAdmin();
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("tips").select("*").eq("source", "model").order("date").order("published_at").range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  writeFileSync(process.argv[2], JSON.stringify(rows));
  console.log(rows.length);
})();
