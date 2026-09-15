// Runs the model over every Group and Listed race on the given dates, using
// the pre-race form and the last price before the jump, and settles each call
// against the result. Writes a JSON file for graphics plus a readable report.
// npx tsx --conditions=react-server --env-file=.env.local scripts/backdate.ts 2026-08-01 2026-08-08 ...
// Replays run races, which the live publish refuses to price.
process.env.OVERLAY_REPLAY = "1";
import { writeFileSync } from "node:fs";
import { getMeetingsByDate, getRace } from "../src/lib/formking/client";
import type { MeetingSummaryLite } from "../src/lib/formking/types";
import { publishRace } from "../src/lib/model/publish";

const GRADE: Record<string, string> = { G1: "Group 1", G2: "Group 2", G3: "Group 3", LR: "Listed" };
const STATES = ["NSW", "VIC", "QLD"];
const NEVER_EXPIRE = 365 * 24 * 60 * 60_000;

interface Call {
  date: string;
  track: string;
  raceNumber: number;
  grade: string;
  raceName: string;
  distance: number;
  going: string;
  tab: number;
  horse: string;
  jockey?: string;
  rated: number;
  market: number;
  open?: number;
  edge: number;
  signal: "back" | "lay";
  prime: boolean;
  rank: number | null;
  finish: number;
  sp?: number;
  won: boolean;
  units: number;
}

interface Race {
  date: string;
  track: string;
  raceNumber: number;
  grade: string;
  raceName: string;
  distance: number;
  going: string;
  prize?: number;
  verdict: string;
  confidence: number;
  top4: { rank: number; tab: number; horse: string; jockey?: string; rated: number; market?: number; edge?: number; signal?: string; finish?: number; why?: string }[];
  result: { pos: number; tab: number; horse: string; sp?: number }[];
  winnerRank: number | null;
  winnerRated?: number;
  winnerSp?: number;
}

async function main() {
  const dates = process.argv.slice(2);
  const races: Race[] = [];
  const calls: Call[] = [];
  for (const date of dates) {
    const index: MeetingSummaryLite[] = await getMeetingsByDate(date, STATES);
    for (const lite of index) {
      const feats = (lite.races ?? []).filter((r) => GRADE[((r as { restrictions?: string }).restrictions ?? "").split(".")[0]] && /result/i.test(r.status ?? ""));
      for (const f of feats) {
        // A form cached before the result landed is bought again.
        const raw = await getRace(lite.id, f.raceId, { ttlMs: NEVER_EXPIRE, accept: (r) => r.entries.some((e) => e.horseResult) });
        const pub = publishRace(raw, { id: lite.id, trackName: lite.trackName, state: lite.state, date: lite.date, updated: 0 });
        if (!pub.placings?.length) continue;
        const grade = GRADE[(raw.restrictions ?? "").split(".")[0]];
        const winner = pub.placings.find((p) => p.position === 1)!;
        const w = pub.runners.find((x) => x.tabNumber === winner.tabNumber)!;
        const race: Race = {
          date, track: lite.trackName ?? "", raceNumber: raw.number, grade, raceName: raw.name, distance: raw.distance,
          going: pub.goingText ?? pub.going, prize: raw.totalPrizeMoney, verdict: pub.verdict, confidence: pub.confidence,
          top4: pub.runners.filter((x) => x.rank).sort((a, b) => a.rank! - b.rank!).map((x) => ({ rank: x.rank!, tab: x.tabNumber, horse: x.horseName, jockey: x.jockey, rated: x.ratedPrice, market: x.marketPrice, edge: x.edge, signal: x.signal, finish: x.finishPosition, why: x.why })),
          result: pub.placings.map((p) => ({ pos: p.position, tab: p.tabNumber, horse: pub.runners.find((x) => x.tabNumber === p.tabNumber)?.horseName ?? "", sp: p.sp })),
          winnerRank: w.rank, winnerRated: w.ratedPrice, winnerSp: winner.sp,
        };
        races.push(race);
        for (const x of pub.runners.filter((x) => x.signal && !x.scratched)) {
          const e = raw.entries.find((y) => y.number === x.tabNumber)!;
          const finish = e.horseResult?.finishPosition ?? 0;
          const won = finish === 1;
          const market = x.marketPrice!;
          calls.push({
            date, track: race.track, raceNumber: raw.number, grade, raceName: raw.name, distance: raw.distance, going: race.going,
            tab: x.tabNumber, horse: x.horseName, jockey: x.jockey, rated: x.ratedPrice, market, open: x.marketOpen, edge: x.edge!,
            signal: x.signal!, prime: x.signal === "back" && (x.edge ?? 0) >= 0.05, rank: x.rank, finish, sp: e.horseResult?.startingPrice || undefined, won,
            units: x.signal === "back" ? (won ? market - 1 : -1) : won ? -(market - 1) : 1,
          });
        }
      }
    }
  }

  const out = "scripts/out/backdate.json";
  writeFileSync(out, JSON.stringify({ races, calls }, null, 2));

  let lines: string[] = [];
  for (const r of races) {
    lines.push(`\n${r.date}  ${r.track} R${r.raceNumber}  ${r.grade}  ${r.raceName}  ${r.distance}m  ${r.going}  $${((r.prize ?? 0) / 1000).toFixed(0)}k  conf ${r.confidence.toFixed(2)}`);
    lines.push(`  ${r.verdict}`);
    for (const t of r.top4) lines.push(`  #${t.rank} ${t.tab}. ${t.horse.padEnd(22)} rated $${t.rated}  mkt $${t.market ?? "-"}  edge ${((t.edge ?? 0) * 100).toFixed(1)}  ${t.signal === "back" ? "BET" : t.signal === "lay" ? "LAY" : "   "}  -> ${t.finish === 1 ? "WON" : t.finish ? `${t.finish}th` : "unpl"}`);
    for (const c of calls.filter((c) => c.date === r.date && c.track === r.track && c.raceNumber === r.raceNumber && !c.rank)) lines.push(`  -- ${c.tab}. ${c.horse.padEnd(22)} rated $${c.rated}  mkt $${c.market}  edge ${(c.edge * 100).toFixed(1)}  ${c.signal === "back" ? "BET" : "LAY"}  -> ${c.finish === 1 ? "WON" : c.finish ? `${c.finish}th` : "unpl"}`);
    lines.push(`  result: ${r.result.map((p) => `${p.pos}. ${p.horse}${p.sp ? ` $${p.sp}` : ""}`).join("  ")}   winner was our #${r.winnerRank ?? "-"} rated $${r.winnerRated}`);
  }
  const bets = calls.filter((c) => c.signal === "back"), lays = calls.filter((c) => c.signal === "lay");
  const sum = (xs: Call[]) => xs.reduce((a, c) => a + c.units, 0);
  lines.push(`\n${races.length} feature races. Winner in our top 4: ${races.filter((r) => r.winnerRank).length}, our #1 won: ${races.filter((r) => r.winnerRank === 1).length}`);
  lines.push(`Bets: ${bets.length}, won ${bets.filter((c) => c.won).length}, level stakes ${sum(bets) >= 0 ? "+" : ""}${sum(bets).toFixed(2)} units`);
  lines.push(`Lays: ${lays.length}, held ${lays.filter((c) => !c.won).length}, 1-unit lays ${sum(lays) >= 0 ? "+" : ""}${sum(lays).toFixed(2)} units`);
  lines.push(`Wrote ${out}`);
  writeFileSync("scripts/out/backdate.txt", lines.join("\n"));
  console.log(lines.join("\n"));
}
main();
