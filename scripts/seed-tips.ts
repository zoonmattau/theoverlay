// Seeds the tips ledger. With dates, records the stored card for each date as
// the morning run would have (no Form King calls). With --backtest, loads
// scripts/out/backtest.json as source 'backtest' so the record can show it.
// npx tsx --conditions=react-server --env-file=.env.local scripts/seed-tips.ts 2026-09-14
// npx tsx --conditions=react-server --env-file=.env.local scripts/seed-tips.ts --backtest
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../src/lib/billing/access";
import { readStoredCard } from "../src/lib/model/store";
import { recordTips, settle, type TipRow } from "../src/lib/tips";

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--backtest") {
    const { calls } = JSON.parse(readFileSync("scripts/out/backtest.json", "utf8")) as { calls: { date: string; track: string; raceNumber: number; tab: number; horse: string; signal: "back" | "lay"; tag?: string; rated: number; market: number; sp?: number; edge: number; finish: number }[] };
    const rows: TipRow[] = calls.map((c) => ({
      date: c.date,
      meeting_id: `${c.track.toLowerCase().replace(/\s+/g, "-")}-${c.date.replace(/-/g, "")}`,
      race_id: `${c.track}:${c.date}:R${c.raceNumber}`,
      race_number: c.raceNumber,
      track: c.track,
      tab_number: c.tab,
      horse_name: c.horse,
      side: c.signal,
      tag: c.tag ?? (c.signal === "lay" ? "lay" : "bet"),
      rated_price: c.rated,
      market_price: c.market,
      edge: c.edge,
      source: "backtest",
      published_at: `${c.date}T22:00:00Z`,
      finish_position: c.finish,
      sp: c.sp ?? null,
      units: settle(c.signal, c.market, c.finish),
      settled_at: `${c.date}T08:00:00Z`,
    }));
    const { error } = await supabaseAdmin().from("tips").upsert(rows, { onConflict: "race_id,tab_number,source" });
    console.log(error ? `failed: ${error.message}` : `backtest: ${rows.length} rows`);
    return;
  }
  for (const date of args) {
    const stored = await readStoredCard(date);
    if (!stored) {
      console.log(`${date}: no stored card`);
      continue;
    }
    await recordTips(date, stored.card);
    const { count } = await supabaseAdmin().from("tips").select("id", { count: "exact", head: true }).eq("date", date).eq("source", "model");
    console.log(`${date}: ${count} calls on the ledger`);
  }
}
main();
