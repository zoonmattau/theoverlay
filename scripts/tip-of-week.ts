// For each Saturday, the Overlay of the Day exactly as the card would have
// published it, with the why, plus every bet on the card settled: the content
// for a "free tip of the week" post and the Saturday wrap. Reads the race
// forms already in the Form King cache, so it costs no credits after backtest.ts.
// npx tsx --conditions=react-server --env-file=.env.local scripts/tip-of-week.ts 2026-08-01 ...
import { writeFileSync } from "node:fs";
import { getMeetingsByDate, getRace } from "../src/lib/formking/client";
import type { MeetingSummary, MeetingSummaryLite, RaceSummary } from "../src/lib/formking/types";
import { observations, settles, tempoFit, finishFit } from "../src/lib/model/narrative";
import { publishMeeting, selectBestBets } from "../src/lib/model/publish";
import type { PublishedMeeting, PublishedRace, PublishedRunner } from "../src/lib/model/types";

const STATES = (process.env.OVERLAY_STATES ?? "NSW,VIC,QLD").split(",");
const NEVER_EXPIRE = 365 * 24 * 60 * 60_000;
const fin = (n?: number) => (n === 1 ? "won" : n === 2 ? "2nd" : n === 3 ? "3rd" : n ? `${n}th` : "unplaced");

/** The case for the horse in plain words: where it settles, the form facts, the tempo, the finish. */
function why(r: PublishedRunner, race: PublishedRace): string[] {
  const t = tempoFit(r, race);
  const f = finishFit(r);
  const facts = observations(r, race).slice(0, 4).map((o) => o.text);
  const lines = [`${settles(r)}.`];
  if (facts.length) lines.push(facts.map((s) => s[0].toUpperCase() + s.slice(1) + ".").join(" "));
  if (t.tone !== 0) lines.push(`${t.text}.`);
  if (f.tone !== 0) lines.push(`${f.text}.`);
  return lines;
}

async function loadDay(date: string) {
  const index: MeetingSummaryLite[] = await getMeetingsByDate(date, STATES);
  const out: { meeting: MeetingSummary; races: RaceSummary[] }[] = [];
  for (const lite of index) {
    if (lite.tabMeeting === false) continue;
    const flat = (lite.races ?? []).filter((r) => (!r.raceType || r.raceType === "Flat") && /result/i.test(r.status ?? ""));
    if (flat.length === 0) continue;
    const races = await Promise.all(flat.map((r) => getRace(lite.id, r.raceId, { ttlMs: NEVER_EXPIRE, accept: (x) => x.entries.some((e) => e.horseResult) })));
    out.push({ meeting: { id: lite.id, trackName: lite.trackName, state: lite.state, date: lite.date, updated: 0 }, races });
  }
  return out;
}

async function main() {
  const weeks = [];
  const text: string[] = [];
  for (const date of process.argv.slice(2)) {
    const raw = await loadDay(date);
    const meetings: PublishedMeeting[] = raw.map(({ meeting, races }) => publishMeeting(meeting, races));
    const selections = selectBestBets(meetings);
    const find = (raceId: string, tab: number) => {
      for (const m of meetings) for (const r of m.races) if (r.raceId === raceId) return { m, r, x: r.runners.find((y) => y.tabNumber === tab)! };
      throw new Error("missing");
    };
    const withResult = (s: (typeof selections)[number]) => {
      const { m, r, x } = find(s.raceId, s.tabNumber);
      const sp = r.placings?.find((p) => p.tabNumber === s.tabNumber)?.sp;
      const won = x.finishPosition === 1;
      const units = s.tag === "lay" ? (won ? -(s.marketPrice! - 1) : 1) : won ? s.marketPrice! - 1 : -1;
      return {
        tag: s.tag, track: m.track, raceNumber: r.raceNumber, raceName: r.name, className: r.className, distance: r.distance, going: r.goingText,
        tab: s.tabNumber, horse: s.horseName, jockey: x.jockey, trainer: x.trainer, barrier: x.barrier, form: x.form,
        rated: s.ratedPrice, market: s.marketPrice!, open: x.marketOpen, edge: s.edge ?? 0, sp, finish: x.finishPosition ?? 0, won, units,
        why: why(x, r), verdict: r.verdict, ratingToday: x.ratings.today, classPoints: r.classPoints,
        result: (r.placings ?? []).map((p) => ({ pos: p.position, horse: r.runners.find((y) => y.tabNumber === p.tabNumber)?.horseName, sp: p.sp })),
      };
    };
    const tip = selections.find((s) => s.tag === "top_overlay");
    const all = selections.map(withResult);
    const bets = all.filter((c) => c.tag !== "lay"), lays = all.filter((c) => c.tag === "lay");
    const sum = (xs: typeof all) => xs.reduce((a, c) => a + c.units, 0);
    const week = { date, tip: tip ? withResult(tip) : undefined, bets, lays, betUnits: sum(bets), layUnits: sum(lays) };
    weeks.push(week);

    text.push(`\n===== ${date} =====`);
    if (week.tip) {
      const t = week.tip;
      text.push(`TIP OF THE WEEK: ${t.tab}. ${t.horse} (${t.jockey}), ${t.track} R${t.raceNumber} ${t.className} ${t.distance}m ${t.going}`);
      text.push(`  Market $${t.market}${t.open ? ` (opened $${t.open})` : ""}, rated $${t.rated}, edge ${(t.edge * 100).toFixed(1)} points`);
      for (const l of t.why) text.push(`  ${l}`);
      text.push(`  RESULT: ${fin(t.finish)}${t.sp ? ` at SP $${t.sp}` : ""}. ${t.result.slice(0, 3).map((p) => `${p.pos}. ${p.horse}`).join(", ")}`);
    } else text.push("TIP OF THE WEEK: none qualified");
    text.push(`SATURDAY WRAP: ${bets.length} bets, ${bets.filter((c) => c.won).length} won, ${sum(bets) >= 0 ? "+" : ""}${sum(bets).toFixed(2)}u level stakes; ${lays.length} lays, ${lays.filter((c) => !c.won).length} held, ${sum(lays) >= 0 ? "+" : ""}${sum(lays).toFixed(2)}u`);
    for (const c of all) text.push(`  ${(c.tag === "lay" ? "LAY" : c.tag === "top_overlay" ? "OTD" : c.tag === "prime_overlay" ? "PRIME" : c.tag === "long_overlay" ? "LONG" : "BET").padEnd(5)} ${c.track} R${c.raceNumber}  ${String(c.tab).padStart(2)}. ${c.horse.padEnd(20)} $${String(c.market).padEnd(5)} rated $${String(c.rated).padEnd(5)} -> ${fin(c.finish).padEnd(8)} ${c.units >= 0 ? "+" : ""}${c.units.toFixed(2)}u`);
  }
  writeFileSync("scripts/out/tip-of-week.json", JSON.stringify(weeks, null, 2));
  writeFileSync("scripts/out/tip-of-week.txt", text.join("\n"));
  console.log(text.join("\n"));
  const tips = weeks.map((w) => w.tip).filter(Boolean) as NonNullable<(typeof weeks)[number]["tip"]>[];
  console.log(`\nTips of the week: ${tips.length}, won ${tips.filter((t) => t.won).length}, ${tips.reduce((a, t) => a + t.units, 0).toFixed(2)}u`);
  console.log(`All bets: ${weeks.reduce((a, w) => a + w.bets.length, 0)}, won ${weeks.reduce((a, w) => a + w.bets.filter((c) => c.won).length, 0)}, ${weeks.reduce((a, w) => a + w.betUnits, 0).toFixed(2)}u`);
}
main();
