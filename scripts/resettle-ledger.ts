// Re-settles the model's ledger at the prices the site now stands by: a bet
// at the better of the best bookmaker price seen and the Betfair SP, a lay
// at the exchange price (the fair price plus 4%, from the prices on the
// stored card). The calls themselves are left as they were made. Done on
// 17 Sep 2026 for the rows from the 11th, when lays moved to the exchange
// price; the lays' +7.4u at the bookies' best became -3.2u.
// npx tsx --conditions=react-server --env-file=.env.local scripts/resettle-ledger.ts 2026-09-11
import { supabaseAdmin } from "../src/lib/billing/access";
import { devig, roundPrice } from "../src/lib/model/rate";
import type { PublishedRace } from "../src/lib/model/types";
import { settle, settledAt } from "../src/lib/tips";
const LAY_OVER_FAIR = 1.04;
(async () => {
  const from = process.argv[2] ?? "2026-09-11";
  const db = supabaseAdmin();
  const { data: tips } = await db.from("tips").select("id, date, race_id, tab_number, side, market_price, units, finish_position").eq("source", "model").not("settled_at", "is", null).gte("date", from);
  const { data: cards } = await db.from("cards").select("card").gte("date", from);
  const races = new Map<string, PublishedRace>();
  for (const c of (cards ?? []) as { card: { meetings: { races: PublishedRace[] }[] } }[]) for (const m of c.card.meetings) for (const r of m.races) races.set(r.raceId, r);
  let changed = 0, before = 0, after = 0;
  for (const t of (tips ?? []) as { id: number; race_id: string; tab_number: number; side: "back" | "lay"; market_price: number; units: number; finish_position: number }[]) {
    const r = races.get(t.race_id);
    if (!r) continue;
    const placing = r.placings?.find((p) => p.tabNumber === t.tab_number);
    let price = Number(t.market_price);
    if (t.side === "lay") {
      const live = r.runners.filter((x) => !x.scratched && x.marketPrice);
      const fair = devig(live.map((x) => x.marketPrice));
      const i = live.findIndex((x) => x.tabNumber === t.tab_number);
      if (i < 0 || !fair[i]) continue;
      price = roundPrice(LAY_OVER_FAIR / fair[i]!);
    }
    const at = settledAt(t.side, price, placing?.bsp);
    const units = settle(t.side, at, t.finish_position);
    before += Number(t.units); after += units;
    if (Math.abs(at - Number(t.market_price)) < 0.005 && Math.abs(units - Number(t.units)) < 0.005) continue;
    const { error } = await db.from("tips").update({ market_price: at, units }).eq("id", t.id);
    if (error) console.error(error.message); else changed++;
  }
  console.log(`${(tips ?? []).length} settled rows from ${from}: ${changed} re-settled, ${before.toFixed(1)}u before, ${after.toFixed(1)}u after`);
})();
