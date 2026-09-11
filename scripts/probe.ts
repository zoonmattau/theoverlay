// Quick look at what the model says for the sample card. Run: node scripts/probe.ts
import { fixtureMeetings } from "../src/lib/formking/fixtures";
import { publishMeeting, selectBestBets } from "../src/lib/model/publish";

const raw = fixtureMeetings("2026-09-11");
const meetings = raw.map((m) => publishMeeting(m.meeting, m.races, m.speedmaps));
for (const m of meetings.slice(0, 1)) {
  for (const r of m.races.slice(0, 3)) {
    console.log(`\n${m.track} R${r.raceNumber} ${r.className} (${r.classPoints}) ${r.going} tempo=${r.pace.tempo} pressure=${r.pace.pressure} conf=${r.confidence}`);
    console.log("  " + r.verdict);
    for (const x of r.runners.filter((x) => !x.scratched).sort((a, b) => b.ratings.today - a.ratings.today)) {
      const g = x.ratings;
      console.log(
        `  ${String(x.tabNumber).padStart(2)} ${x.horseName.padEnd(16)} today=${g.today} cls=${g.class} E${g.early} M${g.mid} L${g.late} P${g.pressure} tf=${g.tempo.fast} ts=${g.tempo.slow} g/s/h=${g.going.good}/${g.going.soft}/${g.going.heavy} ppir=${g.ppir} ${g.map.padEnd(8)} form=${x.form ?? "-"} rated=$${x.ratedPrice} mkt=$${x.marketPrice} edge=${x.edge} ${x.signal ?? ""} ${x.rank ? "#" + x.rank : ""}`,
      );
      if (x.why) console.log("       " + x.why);
    }
  }
}
console.log("\nSelections:", selectBestBets(meetings));
