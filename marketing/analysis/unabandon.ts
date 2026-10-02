// Takes races wrongly marked abandoned back off a day's card: their BetWatch links and
// prices, the day's abandoned list, and the flag on the stored card, so the next price
// rebuild prices them afresh. Written for Pakenham Synthetic on 2 Oct 2026, which matched
// Cranbourne's closed markets.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/unabandon.ts <date> <raceId prefix> [--apply]
import { readPriceBook, writePriceBook } from "../../src/lib/betwatch/prices";
import { supabaseAdmin } from "../../src/lib/billing/access";
import { readStoredCard, writeStoredCard } from "../../src/lib/model/store";

(async () => {
  const [date, prefix] = process.argv.slice(2);
  const apply = process.argv.includes("--apply");
  if (!date || !prefix) throw new Error("usage: unabandon.ts <date> <raceId prefix> [--apply]");
  const hit = (id: string) => id.startsWith(prefix);

  const book = await readPriceBook(date);
  const links = Object.keys(book.ids).filter(hit);
  const prices = Object.keys(book.races).filter(hit);

  const db = supabaseAdmin();
  const { data: ab } = await db.from("fk_cache").select("data").eq("key", `abandoned:${date}`).maybeSingle();
  const list = ((ab?.data as { raceIds?: string[] } | null)?.raceIds ?? []) as string[];
  const listed = list.filter(hit);

  const stored = await readStoredCard(date);
  if (!stored) throw new Error(`no card for ${date}`);
  const flagged = stored.card.meetings.flatMap((m) => m.races).filter((r) => hit(r.raceId) && (r.abandoned || r.closed));

  console.log(`${links.length} BetWatch links, ${prices.length} prices, ${listed.length} on the abandoned list, ${flagged.length} flagged on the card`);
  for (const id of links) console.log("  link", id, "->", book.ids[id]);
  if (!apply) return console.log("dry run: pass --apply to clear them");

  for (const id of links) delete book.ids[id];
  for (const id of prices) delete book.races[id];
  book.missing = (book.missing ?? []).filter((id) => !hit(id));
  await writePriceBook(date, book);

  const { error } = await db.from("fk_cache").update({ data: { raceIds: list.filter((id) => !hit(id)) } }).eq("key", `abandoned:${date}`);
  if (error) throw error;

  for (const r of flagged) {
    delete (r as { abandoned?: boolean }).abandoned;
    delete (r as { closed?: boolean }).closed;
  }
  // The form is already in race_runs; this only rewrites the card's flags.
  await writeStoredCard(date, stored.card, 0, { runs: false });
  console.log("cleared");
})();
