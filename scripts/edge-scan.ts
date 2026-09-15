// Pulls tomorrow's raw races from the fk_cache table and prints the bet edge
// distribution, so a threshold can be chosen on a real card. Run with
// npx tsx --env-file=.env.local scripts/edge-scan.ts 2026-09-12
// Replays run races, which the live publish refuses to price.
process.env.OVERLAY_REPLAY = "1";
import type { MeetingSummaryLite, RaceSummary } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const date = process.argv[2];
const ddmmyy = `${date.slice(8, 10)}${date.slice(5, 7)}${date.slice(2, 4)}`;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, authorization: `Bearer ${key}` };

async function main() {
  const rows = (await (await fetch(`${url}/rest/v1/fk_cache?select=key,data&kind=eq.race&key=like.*_${ddmmyy}_*`, { headers })).json()) as { key: string; data: RaceSummary }[];
  const meetings = (await (await fetch(`${url}/rest/v1/fk_cache?select=key,data&kind=eq.meetings&key=like.*${ddmmyy}*`, { headers })).json()) as { key: string; data: MeetingSummaryLite[] }[];
  const index = meetings.flatMap((m) => m.data);
  const edges: { e: number; p: number; mkt: number; name: string; race: string; rank: number | null }[] = [];
  let races = 0;
  for (const row of rows) {
    const r = row.data;
    const m = index.find((x) => x.races?.some((y) => y.raceId === r.raceId));
    const pub = publishRace(r, { id: m?.id ?? "x", trackName: m?.trackName, state: m?.state, date: m?.date, updated: 0 });
    races++;
    for (const x of pub.runners) {
      if (x.scratched || !x.marketPrice) continue;
      edges.push({ e: x.edge ?? 0, p: x.ratedProbability, mkt: x.marketPrice, name: x.horseName, race: `${m?.trackName} R${pub.raceNumber}`, rank: x.rank });
    }
  }
  console.log(`${races} races, ${edges.length} priced runners`);
  for (const t of [0.01, 0.015, 0.02, 0.03, 0.04, 0.05]) {
    const n = edges.filter((x) => x.e >= t && x.p >= 0.08 && x.mkt <= 26).length;
    const n5 = edges.filter((x) => x.e >= t && x.p >= 0.05 && x.mkt <= 41).length;
    console.log(`edge >= ${t}: ${n} bets (prob>=8%, <=$26), ${n5} with prob>=5% and <=$41`);
  }
  for (const ratio of [0.85, 0.8, 0.75]) {
    const n = edges.filter((x) => x.mkt <= 26 && x.p >= 0.05 && (x.e >= 0.02 || (x.e >= 0.01 && 1 / x.p <= x.mkt * ratio))).length;
    console.log(`points>=2 or (points>=1 and rated <= ${ratio} x market): ${n} bets`);
  }
  console.log("\ntop 25 by edge:");
  for (const x of [...edges].sort((a, b) => b.e - a.e).slice(0, 25)) console.log(`  ${x.race.padEnd(18)} ${x.name.padEnd(20)} edge ${(x.e * 100).toFixed(1)} mkt $${x.mkt} win ${(x.p * 100).toFixed(0)}% rank ${x.rank ?? "-"}`);
}
main();
