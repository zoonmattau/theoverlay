// Fills Betfair's win and place starting prices from BetWatch into the price
// book for a day's resulted races, for a day that ran before the book kept
// them or whose prices posted after the result was taken. Costs no Form King
// credits; the next card rebuild carries them onto the result and the ledger.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-betwatch-sp.ts 2026-10-01
import { betwatchMarkets } from "../src/lib/betwatch/client";
import { readPriceBook, writePriceBook } from "../src/lib/betwatch/prices";
import { readStoredCard } from "../src/lib/model/store";

void (async () => {
  const date = process.argv[2];
  if (!date) throw new Error("Give a date.");
  // Every race the card has resulted, whatever the book still holds: a book
  // written over by an older copy can have lost a race's result (1 Oct 2026).
  const stored = await readStoredCard(date);
  const resulted = (stored?.card.meetings ?? []).flatMap((m) => m.races).filter((r) => r.result?.length).map((r) => r.raceId);
  const book = await readPriceBook(date);
  let filled = 0;
  for (const raceId of resulted) {
    const id = book.ids[raceId];
    const entry = book.races[raceId];
    if (!id || !entry) continue;
    const m = await betwatchMarkets(id);
    if (!m.results) continue;
    const bsp: Record<string, number> = {};
    const bspPlace: Record<string, number> = {};
    for (const r of m.runners) {
      if (r.bsp) bsp[String(r.number)] = r.bsp;
      if (r.bspPlace) bspPlace[String(r.number)] = r.bspPlace;
    }
    const winner = String(m.results[0]?.[0]);
    console.log(raceId.padEnd(16), "win", bsp[winner] ?? "-", "place", m.results.slice(0, 3).flat().map((t) => bspPlace[String(t)] ?? "-").join(" "));
    entry.result = { placings: m.results, bsp, bspPlace, at: entry.result?.at ?? new Date().toISOString() };
    filled++;
  }
  await writePriceBook(date, book);
  console.log(`${filled} races filled for ${date}`);
})();
