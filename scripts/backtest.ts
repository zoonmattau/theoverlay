// Runs the whole card for each date through the model exactly as the morning
// build does, on the pre-race form and the last price before the jump, then
// settles every bet, lay and headline selection. Writes scripts/out/backtest.json
// for calibration and prints the level-stakes record.
// npx tsx --conditions=react-server --env-file=.env.local scripts/backtest.ts 2026-08-01 2026-08-08 ...
import { writeFileSync } from "node:fs";
import { getMeetingsByDate, getRace } from "../src/lib/formking/client";
import type { MeetingSummary, MeetingSummaryLite, RaceSummary } from "../src/lib/formking/types";
import { publishMeeting, selectBestBets } from "../src/lib/model/publish";
import type { PublishedMeeting, SelectionTag } from "../src/lib/model/types";

const STATES = (process.env.OVERLAY_STATES ?? "NSW,VIC,QLD").split(",");
const NEVER_EXPIRE = 365 * 24 * 60 * 60_000;

export interface BtCall {
  date: string;
  track: string;
  raceNumber: number;
  className?: string;
  classPoints: number;
  tab: number;
  horse: string;
  signal: "back" | "lay";
  tag?: SelectionTag;
  rated: number;
  market: number;
  open?: number;
  sp?: number;
  edge: number;
  probability: number;
  confidence: number;
  rank: number | null;
  finish: number;
  won: boolean;
  /** Settled at the market price, one unit. */
  units: number;
  /** Settled at the official SP, one unit. */
  unitsSp: number;
}

export interface BtRace {
  date: string;
  track: string;
  raceNumber: number;
  className?: string;
  runners: number;
  confidence: number;
  winnerRank: number | null;
  winnerSp?: number;
  winnerRated?: number;
  winnerMarket?: number;
}

async function loadDay(date: string): Promise<{ meeting: MeetingSummary; races: RaceSummary[] }[]> {
  const index: MeetingSummaryLite[] = await getMeetingsByDate(date, STATES);
  const out: { meeting: MeetingSummary; races: RaceSummary[] }[] = [];
  for (const lite of index) {
    if (lite.tabMeeting === false) continue;
    const flat = (lite.races ?? []).filter((r) => (!r.raceType || r.raceType === "Flat") && /result/i.test(r.status ?? ""));
    if (flat.length === 0) continue;
    const races = await Promise.all(
      flat.map((r) => getRace(lite.id, r.raceId, { ttlMs: NEVER_EXPIRE, accept: (x) => x.entries.some((e) => e.horseResult) })),
    );
    out.push({
      meeting: { id: lite.id, trackName: lite.trackName, state: lite.state, date: lite.date, status: lite.status, tabMeeting: lite.tabMeeting, railPosition: lite.railPosition, updated: 0 },
      races: races.filter((r) => r.entries.some((e) => e.horseResult)),
    });
  }
  return out;
}

async function main() {
  const dates = process.argv.slice(2);
  const calls: BtCall[] = [];
  const races: BtRace[] = [];
  for (const date of dates) {
    const raw = await loadDay(date);
    const meetings: PublishedMeeting[] = raw.map(({ meeting, races }) => publishMeeting(meeting, races));
    const selections = selectBestBets(meetings);
    const tagOf = new Map(selections.map((s) => [`${s.raceId}:${s.tabNumber}`, s.tag]));
    let dayUnits = 0, dayBets = 0, dayWins = 0;
    for (const [i, m] of meetings.entries()) {
      for (const r of m.races) {
        const src = raw[i].races.find((x) => x.raceId === r.raceId)!;
        const winner = r.placings?.find((p) => p.position === 1);
        const w = winner ? r.runners.find((x) => x.tabNumber === winner.tabNumber) : undefined;
        races.push({
          date, track: m.track, raceNumber: r.raceNumber, className: r.className, runners: r.runners.filter((x) => !x.scratched).length,
          confidence: r.confidence, winnerRank: w?.rank ?? null, winnerSp: winner?.sp, winnerRated: w?.ratedPrice, winnerMarket: w?.marketPrice,
        });
        for (const x of r.runners) {
          if (!x.signal || x.scratched || !x.marketPrice) continue;
          const e = src.entries.find((y) => y.number === x.tabNumber);
          const finish = e?.horseResult?.finishPosition ?? 0;
          const won = finish === 1;
          const sp = e?.horseResult?.startingPrice || undefined;
          const settle = (price: number) => (x.signal === "back" ? (won ? price - 1 : -1) : won ? -(price - 1) : 1);
          const c: BtCall = {
            date, track: m.track, raceNumber: r.raceNumber, className: r.className, classPoints: r.classPoints,
            tab: x.tabNumber, horse: x.horseName, signal: x.signal, tag: tagOf.get(`${r.raceId}:${x.tabNumber}`),
            rated: x.ratedPrice, market: x.marketPrice, open: x.marketOpen, sp, edge: x.edge ?? 0, probability: x.ratedProbability,
            confidence: r.confidence, rank: x.rank, finish, won, units: settle(x.marketPrice), unitsSp: settle(sp ?? x.marketPrice),
          };
          calls.push(c);
          if (c.signal === "back") { dayBets++; dayUnits += c.units; if (won) dayWins++; }
        }
      }
    }
    console.log(`${date}: ${meetings.length} meetings, ${meetings.reduce((n, m) => n + m.races.length, 0)} races, ${dayBets} bets, won ${dayWins}, ${dayUnits >= 0 ? "+" : ""}${dayUnits.toFixed(2)}u`);
  }
  writeFileSync("scripts/out/backtest.json", JSON.stringify({ races, calls }, null, 2));

  const sum = (xs: BtCall[], k: "units" | "unitsSp" = "units") => xs.reduce((a, c) => a + c[k], 0);
  const line = (label: string, xs: BtCall[]) => {
    if (!xs.length) return;
    const wins = xs.filter((c) => c.signal === "back" ? c.won : !c.won).length;
    console.log(`${label.padEnd(34)} n=${String(xs.length).padStart(4)}  hit ${String(wins).padStart(3)} (${((100 * wins) / xs.length).toFixed(0)}%)  market ${(sum(xs) >= 0 ? "+" : "") + sum(xs).toFixed(1)}u (${((100 * sum(xs)) / xs.length).toFixed(0)}% roi)  sp ${(sum(xs, "unitsSp") >= 0 ? "+" : "") + sum(xs, "unitsSp").toFixed(1)}u`);
  };
  const bets = calls.filter((c) => c.signal === "back"), lays = calls.filter((c) => c.signal === "lay");
  console.log(`\n${races.length} races. Winner in top four ${races.filter((r) => r.winnerRank).length} (${((100 * races.filter((r) => r.winnerRank).length) / races.length).toFixed(0)}%), rated #1 won ${races.filter((r) => r.winnerRank === 1).length} (${((100 * races.filter((r) => r.winnerRank === 1).length) / races.length).toFixed(0)}%)`);
  console.log("\nBETS");
  line("all", bets);
  for (const t of ["top_overlay", "prime_overlay", "long_overlay", "bet"] as const) line(`tag ${t}`, bets.filter((c) => c.tag === t));
  for (const [lo, hi] of [[0, 0.03], [0.03, 0.05], [0.05, 0.08], [0.08, 1]]) line(`edge ${lo}-${hi}`, bets.filter((c) => c.edge >= lo && c.edge < hi));
  for (const [lo, hi] of [[1, 3], [3, 5], [5, 8], [8, 12], [12, 27]]) line(`market $${lo}-${hi}`, bets.filter((c) => c.market >= lo && c.market < hi));
  for (const [lo, hi] of [[0, 0.5], [0.5, 0.65], [0.65, 0.8], [0.8, 1.01]]) line(`confidence ${lo}-${hi}`, bets.filter((c) => c.confidence >= lo && c.confidence < hi));
  for (const [lo, hi] of [[0, 60], [60, 72], [72, 90], [90, 200]]) line(`class ${lo}-${hi}`, bets.filter((c) => c.classPoints >= lo && c.classPoints < hi));
  line("rank 1", bets.filter((c) => c.rank === 1));
  line("rank 2-4", bets.filter((c) => c.rank && c.rank > 1));
  line("unranked", bets.filter((c) => !c.rank));
  console.log("\nLAYS");
  line("all", lays);
  for (const [lo, hi] of [[1, 2.5], [2.5, 4], [4, 7], [7, 13]]) line(`market $${lo}-${hi}`, lays.filter((c) => c.market >= lo && c.market < hi));
  for (const [lo, hi] of [[-1, -0.2], [-0.2, -0.15], [-0.15, -0.1]]) line(`edge ${lo}-${hi}`, lays.filter((c) => c.edge >= lo && c.edge < hi));
}
main();
