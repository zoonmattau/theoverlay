// Reads the cached live Form King responses and prints how the model sees them.
import { readdirSync, readFileSync } from "node:fs";
import type { MeetingSummaryLite, RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const files = readdirSync(".formking-cache");
const meetings = files.filter((f) => f.startsWith("meetings-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as MeetingSummaryLite[]).flat();
const races = files.filter((f) => f.startsWith("race-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary);

const edges: number[] = [];
const ratioLog: number[] = [];
for (const r of races) {
  const m = meetings.find((x) => x.id === r.meetingId || x.races?.some((y) => y.raceId === r.raceId));
  const pub = publishRace(r, { id: m?.id ?? "x", trackName: m?.trackName, state: m?.state, date: m?.date, updated: 0 });
  const live = pub.runners.filter((x) => !x.scratched && x.marketPrice);
  for (const x of live) { edges.push(x.edge ?? 0); ratioLog.push(Math.log((x.marketPrice ?? 1) / x.ratedPrice)); }
  if (r.number <= 2 && (m?.trackName ?? "").startsWith("G")) {
    console.log(`\n${m?.trackName} R${r.number} ${r.name} ${r.restrictions} par=${pub.classPoints} tempo=${pub.pace.tempo} conf=${pub.confidence}`);
    for (const x of [...live].sort((a, b) => b.ratings.today - a.ratings.today)) {
      const e = r.entries.find((y) => y.number === x.tabNumber)!;
      const runs = (e.pastEvents ?? []).filter((p) => p.race !== false).length;
      const bench = (e.pastEvents ?? []).filter((p) => p.benchmark).length;
      console.log(`  ${String(x.tabNumber).padStart(2)} ${x.horseName.padEnd(18)} today=${x.ratings.today} cls=${x.ratings.class} OHR=${e.benchmarkRating ?? "-"} runs=${runs}/${bench} rated=$${x.ratedPrice} mkt=$${x.marketPrice} edge=${((x.edge ?? 0) * 100).toFixed(0)}% ${x.signal ?? ""} ${x.rank ? "#" + x.rank : ""} f=${JSON.stringify(x.ratings.factors)}`);
    }
  }
}
const sorted = [...edges].sort((a, b) => a - b);
const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))].toFixed(2);
console.log(`\nrunners=${edges.length} edge quartiles: p10=${q(0.1)} p25=${q(0.25)} p50=${q(0.5)} p75=${q(0.75)} p90=${q(0.9)}`);
console.log(`backs=${edges.filter((e) => e >= 0.08).length} lays=${edges.filter((e) => e <= -0.25).length}`);
console.log(`mean |log(mkt/rated)| = ${(ratioLog.reduce((a, b) => a + Math.abs(b), 0) / ratioLog.length).toFixed(2)}`);
