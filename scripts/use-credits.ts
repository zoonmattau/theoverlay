// Spends Form King credits on full careers, for the 11th of the month before the bundle renews
// (the user, 12 Oct 2026: use them all, save it all). Picks the horses we have met whose whole career
// we have never bought (no kept horse copy, and no more runs held than a day's build brings, 8), the
// most recently seen first, buys each career (2 credits; kept raw by the client) and keeps every run.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/use-credits.ts <credits> [--dry]
import { supabaseAdmin } from "../src/lib/billing/access";
import { getHorse } from "../src/lib/formking/client";
import type { RaceEntry } from "../src/lib/formking/types";
import { rememberRuns, runRowsOf } from "../src/lib/model/runs";
import { rawDays } from "../src/lib/formking/raw";

const budget = Number(process.argv[2]);
const dry = process.argv.includes("--dry");
if (!(budget > 0)) {
  console.log("Usage: use-credits.ts <credits> [--dry]");
  process.exit(1);
}

(async () => {
  const db = supabaseAdmin();
  const wanted: { id: string; name: string; missing: number }[] = [];
  // Recent horses first, in pages, until there are enough with history missing to spend the budget.
  for (let from = 0; wanted.length * 2 < budget; from += 500) {
    const { data: horses } = await db.from("horses").select("id, name").order("last_seen", { ascending: false }).range(from, from + 499);
    if (!horses?.length) break;
    const ids = horses.map((h) => h.id as string);
    const held = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data: rows } = await db.from("runs").select("horse_id").in("horse_id", ids.slice(i, i + 100)).limit(10000);
      for (const r of rows ?? []) held.set(r.horse_id as string, (held.get(r.horse_id as string) ?? 0) + 1);
    }
    for (const h of horses as { id: string; name: string }[]) {
      if ((held.get(h.id) ?? 0) > 8) continue;
      if ((await rawDays(`/b2c/horses/${encodeURIComponent(h.id)}`)).length) continue;
      wanted.push({ id: h.id, name: h.name, missing: 8 - (held.get(h.id) ?? 0) });
      if (wanted.length * 2 >= budget) break;
    }
    if (horses.length < 500) break;
  }
  const buy = wanted.slice(0, Math.floor(budget / 2));
  console.log(`${wanted.length} horses never bought whole; buying ${buy.length} for ${buy.length * 2} credits${dry ? " (dry run)" : ""}`);
  if (dry) return;
  let done = 0, runs = 0, last = 0;
  for (const h of buy) {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const form = await getHorse(h.id);
      const rows = runRowsOf({ horse: form.horse, pastEvents: form.pastEvents } as unknown as RaceEntry, h.id);
      await rememberRuns(rows);
      done++;
      runs += rows.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(h.name, msg);
      if (/402|exhausted/.test(msg)) break;
    }
    if (done % 50 === 0) process.stdout.write(`\r${done} horses, ${runs} runs`);
  }
  console.log(`\n${done} horses bought, ${done * 2} credits, ${runs} runs kept`);
})();
