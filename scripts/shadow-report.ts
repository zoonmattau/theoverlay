// The shadow variant against the live calls, settled race by race from the
// day the shadow started: bets and lays, units and ROI, and the calls only
// one of the two made. Read-only.
// npx tsx --env-file=.env.local scripts/shadow-report.ts [from-date]
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Row { date: string; race_id: string; tab_number: number; horse_name: string; track: string; race_number: number; side: "back" | "lay"; units: number | null; stake: number | null; finish_position: number | null; settled_at: string | null; source: string }

async function rows(source: string, from: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await db.from("tips").select("date, race_id, tab_number, horse_name, track, race_number, side, units, stake, finish_position, settled_at, source").eq("source", source).gte("date", from).range(at, at + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out.filter((r) => r.settled_at && r.finish_position !== null);
}

async function main() {
  const shadow = await rows("shadow", process.argv[2] ?? "2026-10-05");
  const from = shadow.map((r) => r.date).sort()[0];
  if (!from) {
    console.log("No settled shadow calls yet.");
    return;
  }
  // The shadow prices every race on the card from its first day, so the live calls from then on are the fair comparison.
  const live = await rows("model", from);
  const line = (label: string, xs: Row[]) => {
    const staked = xs.reduce((a, r) => a + Number(r.stake ?? 1), 0);
    const units = xs.reduce((a, r) => a + Number(r.units), 0);
    return `${label.padEnd(12)} ${String(xs.length).padStart(4)} calls ${units.toFixed(2).padStart(8)}u ${staked ? ((100 * units) / staked).toFixed(1).padStart(6) : "     -"}%`;
  };
  console.log(`From ${from}`);
  for (const side of ["back", "lay"] as const) {
    console.log(line(`live ${side}`, live.filter((r) => r.side === side)));
    console.log(line(`shadow ${side}`, shadow.filter((r) => r.side === side)));
  }
  const key = (r: Row) => `${r.race_id}:${r.tab_number}:${r.side}`;
  const liveKeys = new Set(live.map(key));
  const shadowKeys = new Set(shadow.map(key));
  const onlyShadow = shadow.filter((r) => !liveKeys.has(key(r)));
  const onlyLive = live.filter((r) => !shadowKeys.has(key(r)));
  console.log(`\n${line("only shadow", onlyShadow)}\n${line("only live", onlyLive)}`);
  for (const r of onlyLive.filter((x) => x.side === "lay").slice(0, 15)) console.log(`  live-only lay ${r.date} ${r.track} R${r.race_number} ${r.horse_name}: ${Number(r.units).toFixed(2)}u`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
