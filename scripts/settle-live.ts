// Settles today's bet and lay calls against results in the cached live card.
import { readdirSync, readFileSync } from "node:fs";
import type { MeetingSummaryLite, RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const files = readdirSync(".formking-cache");
const meetings = files.filter((f) => f.startsWith("meetings-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as MeetingSummaryLite[]).flat();
const races = files.filter((f) => f.startsWith("race-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary);

let betPnl = 0, bets = 0, betWins = 0, layPnl = 0, lays = 0, layHeld = 0;
for (const r of races.sort((a, b) => a.number - b.number)) {
  const m = meetings.find((x) => x.races?.some((y) => y.raceId === r.raceId));
  const pub = publishRace(r, { id: m?.id ?? "x", trackName: m?.trackName, updated: 0 });
  if (!pub.placings?.length) continue;
  const winner = pub.placings.find((p) => p.position === 1);
  for (const x of pub.runners.filter((x) => x.signal)) {
    const e = r.entries.find((y) => y.number === x.tabNumber)!;
    const pos = e.horseResult?.finishPosition ?? 0;
    const sp = e.horseResult?.startingPrice ?? x.marketPrice ?? 0;
    const won = pos === 1;
    if (x.signal === "back") {
      bets++; if (won) betWins++;
      betPnl += won ? sp - 1 : -1;
      console.log(`${m?.trackName} R${r.number}  BET  ${x.tabNumber}. ${x.horseName.padEnd(20)} rated $${x.ratedPrice} took $${x.marketPrice} SP $${sp}  -> ${won ? "WON" : pos ? `${pos}th` : "unpl"}`);
    } else {
      lays++; if (!won) layHeld++;
      // Lay at the live price for 1 unit: keep the stake if it loses, pay (price - 1) if it wins.
      layPnl += won ? -(x.marketPrice! - 1) : 1;
      console.log(`${m?.trackName} R${r.number}  LAY  ${x.tabNumber}. ${x.horseName.padEnd(20)} rated $${x.ratedPrice} laid $${x.marketPrice} SP $${sp}  -> ${won ? "LOST (it won)" : `held, ${pos ? pos + "th" : "unpl"}`}`);
    }
  }
  if (winner) {
    const w = pub.runners.find((x) => x.tabNumber === winner.tabNumber)!;
    console.log(`   winner ${w.tabNumber}. ${w.horseName} rated $${w.ratedPrice} SP $${winner.sp ?? "-"} our rank ${w.rank ?? "-"}`);
  }
}
console.log(`\nBets: ${bets}, won ${betWins}, level stakes ${betPnl >= 0 ? "+" : ""}${betPnl.toFixed(2)} units`);
console.log(`Lays: ${lays}, held ${layHeld}, 1-unit lays ${layPnl >= 0 ? "+" : ""}${layPnl.toFixed(2)} units`);
