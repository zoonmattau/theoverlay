// Moves a stored card's runs out into race_runs, without rebuilding it from
// the feed: read the card, write it back, and writeStoredCard does the split.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/split-card-runs.ts 2026-09-19
//   ...scripts/split-card-runs.ts --all 14    the last 14 dates we hold a card for
import { listStoredDates, readStoredCard, writeStoredCard } from "../src/lib/model/store";

const mb = (o: unknown) => (JSON.stringify(o).length / 1024 / 1024).toFixed(2);

void (async () => {
  const [a, b] = process.argv.slice(2);
  const dates = a === "--all" ? await listStoredDates(Number(b) || 14) : [a];
  if (!dates[0]) throw new Error("Give a date, or --all <n>.");

  for (const date of dates) {
    const stored = await readStoredCard(date);
    if (!stored) {
      console.log(`${date}: no card`);
      continue;
    }
    const before = mb(stored.card);
    const runs = stored.card.meetings.flatMap((m) => m.races).filter((r) => r.runners.some((x) => x.runs?.length)).length;
    if (runs === 0) {
      console.log(`${date}: ${before} MB, already split`);
      continue;
    }
    const at = Date.now();
    await writeStoredCard(date, stored.card, 0);
    const after = await readStoredCard(date);
    console.log(`${date}: ${before} MB -> ${after ? mb(after.card) : "?"} MB, ${runs} races' runs moved, ${Date.now() - at}ms`);
  }
})();
