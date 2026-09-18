// Horses on a winning streak against our price: over every resulted race in the cache, runners whose
// last N counted runs were all wins, what the form said, what the market said, and how many won.
process.env.OVERLAY_REPLAY = "1";
import { readdirSync, readFileSync } from "node:fs";
import type { RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const races = readdirSync(".formking-cache").filter((f) => f.startsWith("race-")).map((f) => JSON.parse(readFileSync(`.formking-cache/${f}`, "utf8")).data as RaceSummary).filter((r) => r.entries.some((e) => e.horseResult) && r.entries.some((e) => e.odds));
interface Row { streak: number; form: number; rated: number; market: number; won: boolean; lay: boolean; slowLast: boolean }
const rows: Row[] = [];
for (const r of races) {
  const pub = publishRace(r, { id: r.meetingId ?? "", trackName: r.trackName, state: "", date: r.date, status: "", tabMeeting: true, updated: 0 });
  const live = pub.runners.filter((x) => !x.scratched && x.formPrice && x.marketPrice);
  const formSum = live.reduce((a, x) => a + 1 / x.formPrice!, 0);
  const mkSum = live.reduce((a, x) => a + 1 / x.marketPrice!, 0);
  for (const x of live) {
    const e = r.entries.find((y) => y.number === x.tabNumber)!;
    const past = (e.pastEvents ?? []).filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched).sort((a, b) => b.date - a.date);
    let streak = 0;
    for (const p of past) { if (p.finishPosition === 1) streak++; else break; }
    const last = past[0];
    // A slowly run last start: the overall clock more than three lengths under the margin reading.
    const slowLast = Boolean(last?.benchmark && last.margin !== undefined && last.benchmark.vsClass < -last.margin - 3);
    rows.push({ streak, form: 1 / x.formPrice! / formSum, rated: x.ratedProbability, market: 1 / x.marketPrice! / mkSum, won: e.horseResult?.finishPosition === 1, lay: x.signal === "lay", slowLast });
  }
}
const line = (label: string, xs: Row[]) => {
  if (!xs.length) return;
  const won = xs.filter((x) => x.won).length;
  const sum = (k: keyof Row) => xs.reduce((a, x) => a + Number(x[k]), 0);
  console.log(`${label.padEnd(44)} n=${String(xs.length).padStart(5)}  won ${String(won).padStart(4)} (${((100 * won) / xs.length).toFixed(0)}%)  form said ${sum("form").toFixed(0)}  rated said ${sum("rated").toFixed(0)}  market said ${sum("market").toFixed(0)}  laid ${xs.filter((x) => x.lay).length}, of those won ${xs.filter((x) => x.lay && x.won).length}`);
};
console.log(`${races.length} races\n`);
for (const n of [0, 1, 2, 3]) line(`last ${n} run${n === 1 ? "" : "s"} won${n === 3 ? " (3 or more)" : ""}`, rows.filter((x) => (n === 3 ? x.streak >= 3 : x.streak === n)));
console.log();
line("streak 2+, market favourite under $2", rows.filter((x) => x.streak >= 2 && x.market >= 0.5));
line("streak 2+, market $2 to $4", rows.filter((x) => x.streak >= 2 && x.market >= 0.25 && x.market < 0.5));
line("streak 2+, last start slowly run", rows.filter((x) => x.streak >= 2 && x.slowLast));
line("streak 2+, last start not slowly run", rows.filter((x) => x.streak >= 2 && !x.slowLast));
line("any horse, last start won and slowly run", rows.filter((x) => x.streak >= 1 && x.slowLast));
line("any horse, last start won at a proper tempo", rows.filter((x) => x.streak >= 1 && !x.slowLast));
