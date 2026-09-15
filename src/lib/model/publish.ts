/**
 * THE COMPLIANCE BOUNDARY.
 *
 * Form King's licence permits publishing our own selections and our own model's
 * rated prices. It prohibits exposing their underlying data, or restating their
 * ratings in a form a reasonable person would recognise as a direct copy.
 *
 * So: Form King types go IN, public types come OUT, and nothing else in the app
 * is allowed to import from src/lib/formking. An ESLint rule enforces that,
 * see eslint.config.mjs. If you need a new field on screen, add it here
 * deliberately, and check it against api-terms first.
 */

import type { MeetingSummary, RaceEntry, RaceSummary, Speedmap } from "@/lib/formking/types";
import type {
  HorseProfile,
  PublishedMeeting,
  PublishedRace,
  PublishedRun,
  PublishedRunner,
  Selection,
  SelectionTag,
  Signal,
} from "./types";
import { classPoints, explain, goingBand, goingLabel, isJumps, mapOf, rateEntries, runPoints, verdict } from "./ratings";
import { rateRace } from "./rate";

/** A long overlay has to actually pay something. */
const LONG_MIN_PRICE = 8;
/**
 * A Prime Overlay is a bet with an edge of five points or more;
 * on today's card only Charlie Messy Hair (6.2 points) clears it.
 */
const PRIME_EDGE = 0.05;
/**
 * Bet and lay thresholds in probability points (our chance minus the
 * market's), set on a live card with scripts/calibrate.ts so a normal day
 * gives about one bet in five races and a few more lays.
 */
const MIN_EDGE = 0.02;
/** A bet needs a real chance and a price someone would actually take. */
const BET_MIN_PROB = 0.08;
const BET_MAX_PRICE = 26;
/** Below this the model is guessing, and we say nothing. */
const MIN_CONFIDENCE = 0.35;
/** Market shorter than our price by this much, on a runner we can lay. */
const LAY_EDGE = -0.12;
/** Laying at long prices is all liability, so cap it. */
const LAY_MAX_PRICE = 12;

/**
 * Where a runner sits on our rating alone, 1 for the highest, so "rates top
 * of the field" stays true whatever its place in the top four. Runners with
 * no form have no rating and sit after the rest.
 */
export function ratingRank(runners: PublishedRunner[], runner: PublishedRunner): number {
  const order = runners
    .filter((x) => !x.scratched)
    .sort((a, b) => Number(b.ratings.runs > 0) - Number(a.ratings.runs > 0) || b.ratings.today - a.ratings.today || b.ratedProbability - a.ratedProbability);
  return order.indexOf(runner) + 1;
}

/** Signals from the last publish, keyed raceId:tab, so a call does not flicker off as prices move. */
export type KeptSignals = Map<string, Signal>;

export function publishRace(
  race: RaceSummary,
  meeting: MeetingSummary,
  speedmap?: Speedmap,
  kept: KeptSignals = new Map(),
): PublishedRace {
  const points = classPoints(race.restrictions, race.name);
  const going = goingBand(race.going);
  const { rated, pace } = rateEntries(
    race.entries,
    { classPoints: points, going, distance: race.distance, track: race.trackName ?? meeting.trackName },
    speedmap,
  );
  const ratedByTab = new Map(rated.map((r) => [r.key, r]));

  const priced = rateRace(
    race.entries.map((e) => {
      const r = ratedByTab.get(String(e.number))?.ratings;
      return {
        key: String(e.number),
        // No runs means no opinion: the market, which has seen the trials, is our number.
        rating: r && r.runs > 0 ? r.today : undefined,
        marketPrice: e.odds?.bestNow,
        scratched: e.scratched,
      };
    }),
  );
  const priceByTab = new Map(priced.runners.map((r) => [r.key, r]));
  const signalByTab = new Map(
    priced.runners.map((p) => [p.key, signalFor(p.edge, p.marketPrice, p.probability, false, kept.get(`${race.raceId}:${p.key}`))]),
  );

  // Our top four: the bets first, best edge leading, then whoever we rate
  // highest on our own numbers. A first starter has no number, so it sits
  // after the exposed form on its market chance alone. The market never
  // orders our four.
  const formed = (k: string) => (ratedByTab.get(k)?.ratings.runs ?? 0) > 0;
  const ranked = [...priced.runners]
    .sort((a, b) => {
      const ab = signalByTab.get(a.key) === "back";
      const bb = signalByTab.get(b.key) === "back";
      if (ab !== bb) return ab ? -1 : 1;
      if (ab && bb) return (b.edge ?? 0) - (a.edge ?? 0);
      const af = formed(a.key);
      const bf = formed(b.key);
      if (af !== bf) return af ? -1 : 1;
      if (af) return ratedByTab.get(b.key)!.ratings.today - ratedByTab.get(a.key)!.ratings.today;
      return b.probability - a.probability;
    })
    .slice(0, 4)
    .map((r) => r.key);

  const fallback = {
    class: points, early: points, mid: points, late: points, pressure: points,
    tempo: { fast: points, slow: points },
    going: { good: points, soft: points, heavy: points },
    distance: points, track: points,
    today: points, factors: {}, runs: 0, ppir: 0, map: "midfield" as const,
  };

  const runners: PublishedRunner[] = race.entries.map((e) => {
    const key = String(e.number);
    const p = priceByTab.get(key);
    const r = ratedByTab.get(key);
    const rank = ranked.indexOf(key);
    const ratings = r?.ratings ?? fallback;
    const signal = e.scratched ? undefined : signalByTab.get(key);
    return {
      tabNumber: e.number,
      horseName: e.horse.name,
      barrier: e.barrier,
      jockey: e.jockey,
      trainer: e.trainer,
      jockeyWin: e.jockeyForm?.lastTwelveMonthWinPercentage,
      trainerWin: e.trainerForm?.lastTwelveMonthWinPercentage,
      weight: e.weightCarried ?? e.weight,
      form: r?.form,
      scratched: Boolean(e.scratched),
      ratings,
      ratedPrice: p?.ratedPrice ?? 0,
      ratedProbability: p?.probability ?? 0,
      marketPrice: p?.marketPrice,
      bookies: e.odds?.bestBookies?.length ? e.odds.bestBookies : undefined,
      marketAvg: e.odds?.avgNow || undefined,
      marketOpen: e.odds?.avgOpen && e.odds.avgOpen > 1.05 ? e.odds.avgOpen : undefined,
      marketMove: e.odds?.firmOrDrift,
      marketAt: e.odds?.timestamp ? new Date(e.odds.timestamp).toISOString() : undefined,
      edge: p?.edge,
      rank: rank >= 0 ? rank + 1 : null,
      signal,
      finishPosition: e.horseResult ? e.horseResult.finishPosition : undefined,
      horse: profileOf(e),
      runs: runsOf(e, points),
    };
  });

  linkMeetings(runners);

  // One lay a race at most: the one the market has most wrong.
  const lays = runners.filter((x) => x.signal === "lay").sort((a, b) => (a.edge ?? 0) - (b.edge ?? 0));
  for (const extra of lays.slice(1)) extra.signal = undefined;
  for (const x of runners) if (x.rank) x.why = explain(x.ratings, ratingRank(runners, x), { going, tempo: pace.tempo }, x.signal);

  const top = ranked
    .map((k) => runners.find((x) => String(x.tabNumber) === k)!)
    .map((x) => ({ horseName: x.horseName, ratings: x.ratings }));

  // First four home, only once Form King has a result on the entries.
  const placed = race.entries
    .filter((e) => e.horseResult && e.horseResult.finishPosition > 0)
    .sort((a, b) => a.horseResult!.finishPosition - b.horseResult!.finishPosition)
    .slice(0, 4);
  const result = placed.length > 0 ? placed.map((e) => e.number) : undefined;
  const placings = placed.length > 0
    ? placed.map((e) => {
        const h = e.horseResult!;
        return {
          position: h.finishPosition,
          tabNumber: e.number,
          margin: h.margin,
          sp: h.startingPrice || undefined,
          bsp: h.betfairStartingPrice || undefined,
          // TAB dividends when Form King has them, Betfair's otherwise.
          win: h.finishPosition === 1 ? h.toteWin || h.bestToteWin || h.startingPrice || undefined : undefined,
          place: h.finishPosition <= 3 ? h.totePlace || h.betfairPlaceDiv || undefined : undefined,
        };
      })
    : undefined;

  return {
    raceId: race.raceId,
    meetingId: meeting.id,
    raceNumber: race.number,
    name: race.name,
    distance: race.distance,
    className: classLabel(race.restrictions, points),
    classPoints: points,
    going,
    goingText: goingLabel(race.going, race.goingNumber),
    jumpTime: jumpIso(meeting.date ?? race.date, race.startTime, race.date, meeting.state),
    prizeMoney: race.totalPrizeMoney,
    runners: runners.sort((a, b) => a.tabNumber - b.tabNumber),
    pace,
    result,
    placings,
    confidence: priced.confidence,
    verdict: verdict(top, pace.tempo),
  };
}

/** A readable class from the restrictions code: "72B.3+.." becomes "BM72". */
function classLabel(restrictions: string | undefined, points: number): string {
  const code = (restrictions ?? "").split(".")[0].toUpperCase();
  const bm = code.match(/^(\d{2,3})[BR+]/);
  if (bm) return `BM${bm[1]}`;
  const words: Record<string, string> = {
    MDN: "Maiden", OPN: "Open", LR: "Listed", G1: "Group 1", G2: "Group 2", G3: "Group 3",
    C1: "Class 1", C2: "Class 2", C3: "Class 3", C4: "Class 4", C5: "Class 5", C6: "Class 6",
    HDM: "Hurdle", HDL: "Hurdle", STM: "Steeple",
  };
  return words[code] ?? (code || `BM${points}`);
}

/**
 * Jump time as ISO. Form King gives the meeting date and a local start time
 * like "12:20pm"; the sample card gives the jump as a timestamp directly.
 */
/**
 * The jump as an instant. The feed's race date is the real start time, so it
 * wins; the printed start time is local to the track and only a fallback.
 */
function jumpIso(meetingDate?: number, startTime?: string, raceDate?: number, state?: string): string | undefined {
  if (raceDate && raceDate > 1e12) return new Date(raceDate).toISOString();
  const m = startTime?.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (m && meetingDate) {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") h += 12;
    const zone = zoneFor(state);
    const day = new Date(meetingDate).toLocaleDateString("en-CA", { timeZone: zone });
    return `${day}T${String(h).padStart(2, "0")}:${m[2]}:00${zoneOffset(new Date(meetingDate), zone)}`;
  }
  return undefined;
}

/** The track's time zone from its state. */
export function zoneFor(state?: string): string {
  switch ((state ?? "").toUpperCase()) {
    case "QLD":
      return "Australia/Brisbane";
    case "SA":
      return "Australia/Adelaide";
    case "NT":
      return "Australia/Darwin";
    case "WA":
      return "Australia/Perth";
    case "TAS":
      return "Australia/Hobart";
    default:
      return "Australia/Sydney";
  }
}

/** "+10:00", "+09:30", "+08:00" and so on for a zone on a date. */
export function zoneOffset(d: Date, zone: string): string {
  const part = new Intl.DateTimeFormat("en-AU", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "+10:00";
}

/** Back when the market is long enough, lay when it is short enough. */
function signalFor(
  edge: number | undefined,
  marketPrice: number | undefined,
  probability: number | undefined,
  scratched?: boolean,
  kept?: Signal,
): Signal | undefined {
  if (scratched || edge === undefined || !marketPrice || probability === undefined) return undefined;
  if (edge >= MIN_EDGE && probability >= BET_MIN_PROB && marketPrice <= BET_MAX_PRICE) return "back";
  if (edge <= LAY_EDGE && marketPrice <= LAY_MAX_PRICE) return "lay";
  // A call already published stays while it still has half its edge, so a
  // ten-cent move in the market does not make a tip vanish between refreshes.
  if (kept === "back" && edge >= MIN_EDGE / 2 && marketPrice <= BET_MAX_PRICE * 1.5) return "back";
  if (kept === "lay" && edge <= LAY_EDGE / 2 && marketPrice <= LAY_MAX_PRICE * 1.5) return "lay";
  return undefined;
}

/** Public form-guide facts about the horse, nothing of Form King's own. */
function profileOf(e: RaceEntry): HorseProfile {
  return {
    age: e.horse.age,
    sex: e.horse.type,
    sire: e.horse.sire,
    dam: e.horse.dam,
    daysSinceLastRun: e.daysSinceLastRace,
    firstStarter: Boolean(e.firstStarter),
    career: e.form?.careerForm,
    firstUpForm: e.form?.firstUpForm,
    secondUpForm: e.form?.secondUpForm,
    distanceForm: e.form?.distanceForm,
    trackForm: e.form?.trackForm,
    gear: (e.gear ?? []).filter((g) => g.on !== false && !/gelded/i.test(g.gear)).map((g) => g.gear),
    // The feed lists gelding as a gear change; it is a one-way operation.
    gearChanges: (e.gear ?? [])
      .filter((g) => g.change && g.change !== "STAYING_ON")
      .map((g) =>
        /gelded/i.test(g.gear)
          ? "Gelded since last start"
          : `${g.gear} ${g.change === "ON_FIRST_TIME" ? "on first time" : g.change === "ON_AGAIN" ? "back on" : g.change === "OFF_FIRST_TIME" ? "off first time" : "off again"}`,
      ),
  };
}

/** The last ten starts, most recent first, plus our points for each. */
function runsOf(e: RaceEntry, todayPar: number): PublishedRun[] {
  return (e.pastEvents ?? [])
    .filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched && !isJumps(p.raceName))
    .sort((a, b) => b.date - a.date)
    .slice(0, 10)
    .map((p) => ({
      date: new Date(p.date).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }),
      track: p.track,
      distance: p.distance,
      going: goingLabel(p.going),
      className: classOf(p.raceName),
      finish: p.finishPosition || undefined,
      runners: p.numRunners,
      margin: p.margin,
      weight: p.weight,
      sp: p.startingPrice,
      map: p.posSettling && p.numRunners ? mapOf(p.posSettling, p.numRunners) : undefined,
      time: p.timeInMillis ? Math.round(p.timeInMillis / 10) / 100 : undefined,
      last600: p.sectionalTimeInMillis && p.sectionalDistance === 600 ? Math.round(p.sectionalTimeInMillis / 10) / 100 : undefined,
      vsBench: p.benchmark ? Math.round(p.benchmark.vsClass * 10) / 10 : undefined,
      vsBench600: p.benchmark?.sections?.["6-F"]?.vsClass !== undefined ? Math.round(p.benchmark.sections["6-F"]!.vsClass * 10) / 10 : undefined,
      points: Math.round(runPoints(p, todayPar, e.horse.age) * 10) / 10,
      raceKey: p.raceId ?? `${new Date(p.date).toISOString().slice(0, 10)}:${p.track ?? ""}:${p.raceNumber}`,
      placings: (p.placings ?? [])
        .filter((x) => x.finishPosition >= 1 && x.finishPosition <= 4)
        .sort((a, b) => a.finishPosition - b.finishPosition)
        .map((x) => ({ pos: x.finishPosition, horse: x.horse, margin: x.margin, weight: x.weight })),
    }));
}

/**
 * Cross-references every runner's past runs with the rest of today's field,
 * so a run shows who in this race it beat or finished behind.
 */
function linkMeetings(runners: PublishedRunner[]): void {
  const seen = new Map<string, { tab: number; finish?: number; margin?: number }[]>();
  for (const r of runners) {
    for (const run of r.runs ?? []) {
      if (!run.raceKey) continue;
      seen.set(run.raceKey, [...(seen.get(run.raceKey) ?? []), { tab: r.tabNumber, finish: run.finish, margin: run.margin }]);
    }
  }
  for (const r of runners) {
    for (const run of r.runs ?? []) {
      const others = run.raceKey ? (seen.get(run.raceKey) ?? []).filter((x) => x.tab !== r.tabNumber) : [];
      if (others.length) run.met = others;
    }
  }
}

/** "Midway (Bm72)" → "Bm72", "3yo+ Mdn Plate" → "Mdn", else the name trimmed. */
function classOf(name?: string): string | undefined {
  if (!name) return undefined;
  const bm = name.match(/\((bm\s?\d+|[^)]*)\)/i);
  if (bm) return bm[1].replace(/\s+/g, "");
  const m = name.match(/\b(mdn|maiden|cl\s?\d|class\s?\d|open|hcp|rs\d\w*|listed|group\s?\d|g\d|bm\s?\d+|benchmark\s?\d+)\b/i);
  return m ? m[1].replace(/\s+/g, "") : name.slice(0, 18);
}

export function publishMeeting(
  meeting: MeetingSummary,
  races: RaceSummary[],
  speedmaps: Record<string, Speedmap> = {},
  kept: KeptSignals = new Map(),
): PublishedMeeting {
  const first = races[0];
  return {
    meetingId: meeting.id,
    date: new Date(meeting.date ?? Date.now()).toLocaleDateString("en-CA", {
      timeZone: "Australia/Sydney",
    }),
    track: meeting.trackName ?? first?.trackName ?? meeting.id,
    state: meeting.state ?? "",
    code: "T",
    trackCondition: first ? goingLabel(first.going, first.goingNumber) : undefined,
    railPosition: meeting.railPosition ?? first?.railPosition,
    races: races
      .map((r) => publishRace(r, meeting, speedmaps[r.raceId], kept))
      .sort((a, b) => a.raceNumber - b.raceNumber),
  };
}

/**
 * Pick the day's headline bets across every meeting.
 *
 * Deliberately allowed to return nothing. A day with no qualifying bet is a
 * real result, and publishing "no bet" builds more trust than manufacturing
 * three selections because the page has three slots.
 */
export function selectBestBets(meetings: PublishedMeeting[]): Selection[] {
  const pool = meetings.flatMap((m) =>
    m.races
      .filter((r) => r.confidence >= MIN_CONFIDENCE)
      .flatMap((r) =>
        r.runners
          .filter((x) => !x.scratched && x.edge !== undefined && x.marketPrice)
          .map((x) => ({ meeting: m, race: r, runner: x })),
      ),
  );

  const qualifying = pool.filter((x) => x.runner.signal === "back");
  const out: Selection[] = [];
  const used = new Set<string>();

  const take = (
    tag: SelectionTag,
    candidates: typeof qualifying,
    rank: (a: (typeof qualifying)[number], b: (typeof qualifying)[number]) => number,
  ) => {
    const pick = candidates.filter((c) => !used.has(key(c))).sort(rank)[0];
    if (!pick) return;
    used.add(key(pick));
    out.push({
      tag,
      meetingId: pick.meeting.meetingId,
      track: pick.meeting.track,
      raceId: pick.race.raceId,
      raceNumber: pick.race.raceNumber,
      tabNumber: pick.runner.tabNumber,
      horseName: pick.runner.horseName,
      ratedPrice: pick.runner.ratedPrice,
      ratedProbability: pick.runner.ratedProbability,
      marketPrice: pick.runner.marketPrice,
      bookies: pick.runner.bookies,
      marketAvg: pick.runner.marketAvg,
      marketOpen: pick.runner.marketOpen,
      marketMove: pick.runner.marketMove,
      marketAt: pick.runner.marketAt,
      edge: pick.runner.edge,
      finishPosition: pick.race.result ? pick.runner.finishPosition : undefined,
      jumpTime: pick.race.jumpTime,
    });
  };

  // Overlay of the day: the biggest edge on the card, at any price.
  take("top_overlay", qualifying, (a, b) => (b.runner.edge ?? 0) - (a.runner.edge ?? 0));

  // Prime overlays: every other bet with a top-fifth edge, biggest first.
  for (const c of [...qualifying]
    .filter((c) => (c.runner.edge ?? 0) >= PRIME_EDGE && !used.has(key(c)))
    .sort((a, b) => (b.runner.edge ?? 0) - (a.runner.edge ?? 0))) {
    take("prime_overlay", [c], () => 0);
  }

  // Long overlay: best edge at a genuine each-way price.
  take(
    "long_overlay",
    qualifying.filter((c) => (c.runner.marketPrice ?? 0) >= LONG_MIN_PRICE),
    (a, b) => (b.runner.edge ?? 0) - (a.runner.edge ?? 0),
  );

  // Then every other bet, biggest edge first, and every lay, shortest first,
  // so the home page shows the whole day's calls and not just the headliners.
  for (const c of [...qualifying].filter((c) => !used.has(key(c))).sort((a, b) => (b.runner.edge ?? 0) - (a.runner.edge ?? 0))) take("bet", [c], () => 0);
  for (const c of pool.filter((x) => x.runner.signal === "lay").sort((a, b) => (a.runner.edge ?? 0) - (b.runner.edge ?? 0))) take("lay", [c], () => 0);

  return out;
}

const key = (c: { race: PublishedRace; runner: PublishedRunner }) =>
  `${c.race.raceId}:${c.runner.tabNumber}`;

/**
 * One race a day is open to everyone, so a first-time visitor sees a real
 * tip before paying: the race an admin pinned, else the one already chosen
 * for the day, else one of the day's bets drawn at random (seeded by the
 * date, so every rebuild agrees), else the earliest race still to jump.
 */
export function pickFreeRace(meetings: PublishedMeeting[], pinned?: string, previous?: string): string | undefined {
  const races = meetings
    .flatMap((m) => m.races)
    .filter((r) => r.jumpTime)
    .sort((a, b) => a.jumpTime!.localeCompare(b.jumpTime!));
  const has = (id?: string) => Boolean(id) && races.some((r) => r.raceId === id);
  if (has(pinned)) return pinned;
  if (has(previous)) return previous;
  const withBet = races.filter((r) => !r.result && r.runners.some((x) => x.signal === "back" && !x.scratched));
  if (withBet.length > 0) return withBet[seed(meetings[0]?.date ?? "") % withBet.length].raceId;
  return (races.find((r) => !r.result) ?? races[0])?.raceId;
}

/** A small stable hash, so a draw for a date comes out the same every time. */
function seed(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
