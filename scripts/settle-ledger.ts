// Settles the ledger from the stored cards: every call on a day whose race
// has its result on the card but no settlement on the ledger. The ledger
// settles when a card rebuilds after a result lands, so the last races of a
// day, resulted after the day's last rebuild, were left open (50 calls on 19
// and 20 Sep 2026, two winners among them). Idempotent: a settled call is
// only ever moved to a better price.
// npx tsx --conditions=react-server --env-file=.env.local scripts/settle-ledger.ts 2026-09-16 2026-09-17 ...
import { settleCreatorTips } from "../src/lib/creators";
import { readStoredCard } from "../src/lib/model/store";
import { recordTips } from "../src/lib/tips";

(async () => {
  for (const date of process.argv.slice(2)) {
    const stored = await readStoredCard(date);
    if (!stored) { console.log(`${date}: no card`); continue; }
    const resulted = stored.card.meetings.flatMap((m) => m.races).filter((r) => r.result?.length).length;
    await recordTips(date, stored.card);
    await settleCreatorTips(date, stored.card);
    console.log(`${date}: ${resulted} resulted races on the card, ledger settled`);
  }
})();
