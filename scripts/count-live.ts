import { readdirSync, readFileSync } from "node:fs";
import type { MeetingSummaryLite, RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";
const files = readdirSync(".formking-cache");
const meetings = files.filter((f) => f.startsWith("meetings-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as MeetingSummaryLite[]).flat();
const races = files.filter((f) => f.startsWith("race-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary);
let backs = 0, lays = 0;
for (const r of races) {
  const m = meetings.find((x) => x.races?.some((y) => y.raceId === r.raceId));
  const pub = publishRace(r, { id: m?.id ?? "x", trackName: m?.trackName, updated: 0 });
  const b = pub.runners.filter((x) => x.signal === "back"); const l = pub.runners.filter((x) => x.signal === "lay");
  backs += b.length; lays += l.length;
  if (b.length || l.length) console.log(`${m?.trackName} R${r.number}: ${b.map((x) => `BET ${x.tabNumber}. ${x.horseName} $${x.ratedPrice} v $${x.marketPrice}`).join(", ")} ${l.map((x) => `LAY ${x.tabNumber}. ${x.horseName} $${x.ratedPrice} v $${x.marketPrice}`).join(", ")}`);
}
console.log(`\n${races.length} races: ${backs} bets, ${lays} lays`);
