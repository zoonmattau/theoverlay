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

import type { MeetingSummary, PastEvent, RaceEntry, RaceSummary, Speedmap } from "@/lib/formking/types";
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
import { callEdge, callPrice, ROUGHIE_FROM } from "./types";
import { classPoints, explain, goingBand, goingLabel, isJumps, mapOf, rateEntries, RUN_WEIGHTS, runPoints, sectionPoints, splitOf, toFeedScale, verdict } from "./ratings";
import { prepStage } from "./factors";
import { rateRace, roundPrice } from "./rate";

/** A long overlay has to actually pay something. */
const LONG_MIN_PRICE = 8;
/**
 * Bet and lay thresholds in points of win chance, ours against the
 * market's. Set with scripts/sweep.ts over the resulted races in the local
 * cache, with the market weight at 0.5 and the meld pulling our biggest
 * disagreements toward the market: about two bets in three races. The lay
 * threshold was reset with scripts/sweep-lay-meld.ts once the meld reached
 * the lay side too: ten points there is the disagreement fourteen was
 * before, a lay in about one race in four, and clears exchange commission
 * and a longer lay price by the same margin. Since 17 Sep 2026 a lay is
 * judged at the exchange price (the fair price plus 4%, which is what the
 * Betfair SP ran at over 76 settled lays) rather than the bookmakers' best,
 * and the line is six points there: the same one lay in four races, +10%
 * after commission over the cache where ten points found thirteen lays.
 * The bet line came down from 2.5 to 2 points on 18 Sep 2026
 * (scripts/sweep-bet-line.ts, 889 races): the band between the two is the
 * best band there is, 146 bets at +25%, and at two points the model makes
 * 0.44 bets a race at +19% (+9% at SP) against 0.27 at +16% (+4%) above
 * it; below two points it runs to breakeven.
 */
export const MIN_EDGE = Number(process.env.OVERLAY_MIN_EDGE ?? 0.02);
/** A Prime Overlay is a bet with a wide gap on a horse we give a real chance. */
const PRIME_EDGE = 0.05;
const PRIME_MIN_PROB = 0.15;
/**
 * A bet needs a real chance and a price someone would actually take, unless
 * it is a Way Overlay: from ROUGHIE_FROM up a bet stands on its edge alone,
 * at any price, which the user asked for on 18 Sep 2026 knowing the cache
 * runs negative at SP there (scripts/sweep-roughies.ts).
 */
const BET_MIN_PROB = 0.08;
const BET_MAX_PRICE = 26;
/** Below this the model is guessing, and we say nothing. */
const MIN_CONFIDENCE = 0.35;
/**
 * Below this trust in the rating there is no bet: 0.3 lets a horse on one
 * run (trust 0.35) in, which the user asked for on 18 Sep 2026 (Far And
 * Wide, Townsville, rated $3.20 off one fast maiden win against $4). The
 * lay floor stays at 0.4, two runs (0.55) in and one out: over the cache
 * one-run horses added four bets at breakeven and six lays of which five
 * won (scripts/sweep-bet-line.ts with OVERLAY_TRUST_FLOOR=0.3).
 */
const TRUST_FLOOR = Number(process.env.OVERLAY_TRUST_FLOOR ?? 0.3);
const LAY_TRUST_FLOOR = Number(process.env.OVERLAY_LAY_TRUST_FLOOR ?? 0.4);
/** Market shorter than our price by this much, on a runner we can lay. */
export const LAY_EDGE = Number(process.env.OVERLAY_LAY_EDGE ?? -0.06);
/** Laying at long prices is all liability, so cap it. */
const LAY_MAX_PRICE = 12;
/**
 * The last half hour before the jump. A call on the card inside it is locked
 * in: it stays whatever the market does from here and settles on the record.
 * Lays go to Discord once a race is inside it too, since a lay is struck on
 * the exchange price at the time.
 */
export const CALL_LOCK_MS = 30 * 60_000;

/** Whether a race is inside the last half hour before its jump, or has jumped. */
export const inCallLock = (jumpTime?: string, now = Date.now()) => Boolean(jumpTime && new Date(jumpTime).getTime() - now <= CALL_LOCK_MS);

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
    { classPoints: points, going, distance: race.distance, track: race.trackName ?? meeting.trackName, date: race.date },
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
        trust: r?.trust,
        layQuote: e.odds?.exchange?.lay,
        marketPrice: e.odds?.bestNow,
        scratched: e.scratched,
      };
    }),
  );
  const priceByTab = new Map(priced.runners.map((r) => [r.key, r]));
  // Once the race has jumped the market is over: bookmakers leave quotes up
  // that nobody can take, so a call made now would be priced off nothing.
  // Calls already published stay; no new one is made.
  // A backtest replays run races on purpose: OVERLAY_REPLAY=1 lets it.
  const jumpTime = jumpIso(meeting.date ?? race.date, race.startTime, race.date, meeting.state);
  const jumped = process.env.OVERLAY_REPLAY !== "1" && hasJumped(race.status, jumpTime);
  // Inside the last half hour a call already on the card is locked in: a
  // member has had it since the morning, so it is tracked whatever the
  // market does with three minutes to go. A new call can still be made.
  const locked = jumped || (process.env.OVERLAY_REPLAY !== "1" && inCallLock(jumpTime));
  // Below the confidence floor the model is guessing and no call is made,
  // on the runner as well as in the day's selections, so the race page and
  // the home page count agree with the email.
  const guessing = priced.confidence < MIN_CONFIDENCE;
  const signalByTab = new Map(
    priced.runners.map((p) => {
      const held = kept.get(`${race.raceId}:${p.key}`);
      // No runs means no opinion, and no opinion is never a call, held or new:
      // its price is the market's, moved only by the field normalising around it.
      const g = ratedByTab.get(p.key)?.ratings;
      const trust = g?.trust ?? 1;
      if ((g?.runs ?? 0) === 0 || trust < TRUST_FLOOR) return [p.key, undefined];
      const signal = held && (locked || guessing) ? held : jumped || guessing ? undefined : signalFor(p.edge, p.marketPrice, p.probability, false, held, p.layEdge, p.layPrice);
      // A thin rating can back a horse but not lay one: the mirage costs one unit as a bet and the price as a lay.
      if (signal === "lay" && trust < LAY_TRUST_FLOOR) return [p.key, undefined];
      // Nor is a horse on a winning run laid: even rated for the run, the lays
      // left on them lost 45% of the time over the cache (14 laid, 6 won)
      // against 34% for lays at large; taking them out costs two units in
      // 889 races and the record's ROI does not move. Aethelwulf, Newcastle
      // Gold Cup, 18 Sep 2026.
      if (signal === "lay" && (g?.factors.streak ?? 0) > 0) return [p.key, undefined];
      return [p.key, signal];
    }),
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
    today: points, factors: {}, runs: 0, trust: 0, ppir: 0, map: "midfield" as const,
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
      horseId: (e as RaceEntry & { breedingId?: string }).breedingId,
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
      formPrice: p?.modelPrice,
      ratedProbability: p?.probability ?? 0,
      marketPrice: p?.marketPrice,
      bookies: e.odds?.bestBookies?.length ? e.odds.bestBookies : undefined,
      marketAvg: e.odds?.avgNow || undefined,
      marketOpen: e.odds?.avgOpen && e.odds.avgOpen > 1.05 ? e.odds.avgOpen : undefined,
      marketMove: e.odds?.firmOrDrift,
      marketAt: e.odds?.timestamp ? new Date(e.odds.timestamp).toISOString() : undefined,
      edge: p?.edge,
      layPrice: p?.layPrice,
      laySize: e.odds?.exchange?.lay ? e.odds.exchange.laySize : undefined,
      exchangeBack: e.odds?.exchange?.back,
      priceSource: e.odds?.source,
      layEdge: p?.layEdge,
      rank: rank >= 0 ? rank + 1 : null,
      signal,
      finishPosition: e.horseResult ? e.horseResult.finishPosition : undefined,
      horse: profileOf(e),
      runs: runsOf(e, points, race.distance, race.date),
    };
  });

  linkMeetings(runners);

  // One lay a race at most: the one the market has most wrong.
  const lays = runners.filter((x) => x.signal === "lay").sort((a, b) => (a.layEdge ?? a.edge ?? 0) - (b.layEdge ?? b.edge ?? 0));
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
    // The par on the page sits on the ratings' scale, so a runner reads against it.
    classPoints: toFeedScale(points),
    going,
    goingText: goingLabel(race.going, race.goingNumber),
    jumpTime,
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
/** Whether the race has been run: Form King says so, or its jump time has passed. */
/**
 * The strict price on a call: the shortest a bet is still worth taking
 * (our chance less the edge a bet needs) and the longest a lay is still
 * worth laying (our chance plus the edge a lay needs). Beyond it the call
 * is off.
 */
export function callLimit(x: { signal?: Signal; ratedProbability: number }): number | undefined {
  if (x.signal === "back") return x.ratedProbability > MIN_EDGE ? roundPrice(1 / (x.ratedProbability - MIN_EDGE)) : undefined;
  if (x.signal === "lay") return roundPrice(1 / (x.ratedProbability - LAY_EDGE));
  return undefined;
}

export function hasJumped(status?: string, jumpTime?: string, now = Date.now()): boolean {
  if (/result|abandon|closed|interim/i.test(status ?? "")) return true;
  return Boolean(jumpTime && new Date(jumpTime).getTime() <= now);
}

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
  layEdge?: number,
  layPrice?: number,
): Signal | undefined {
  if (scratched || edge === undefined || !marketPrice || probability === undefined) return undefined;
  const roughie = marketPrice >= ROUGHIE_FROM;
  if (edge >= MIN_EDGE && (roughie || (probability >= BET_MIN_PROB && marketPrice <= BET_MAX_PRICE))) return "back";
  // A lay is judged at the price it is struck at on the exchange, not the bookmakers' best.
  const le = layEdge ?? edge, lp = layPrice ?? marketPrice;
  if (le <= LAY_EDGE && lp <= LAY_MAX_PRICE) return "lay";
  // A call already published stays while it still has half its edge, so a
  // ten-cent move in the market does not make a tip vanish between refreshes.
  if (kept === "back" && edge >= MIN_EDGE / 2 && (roughie || marketPrice <= BET_MAX_PRICE * 1.5)) return "back";
  if (kept === "lay" && le <= LAY_EDGE / 2 && lp <= LAY_MAX_PRICE * 1.5) return "lay";
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
    runInPrep: prepStage(e) || undefined,
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

/** The run's early, mid and late lengths against class, the same split the ratings use. */
function sectionsOf(p: PastEvent, today: number): { early?: number; mid?: number; late?: number; earlyPts?: number; midPts?: number; latePts?: number } {
  if (!p.benchmark) return {};
  const s = splitOf(p.benchmark);
  const pts = sectionPoints(s, p.distance, today, goingBand(p.going));
  const r = (v?: number) => (v === undefined ? undefined : Math.round(v * 10) / 10);
  return { early: r(s.early), mid: r(s.mid), late: r(s.late), earlyPts: r(pts.early), midPts: r(pts.mid), latePts: r(pts.late) };
}

/** The last ten starts, most recent first, plus our points for each. */
function runsOf(e: RaceEntry, todayPar: number, todayDistance: number, asOf?: number): PublishedRun[] {
  return (e.pastEvents ?? [])
    .filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched && !isJumps(p))
    .sort((a, b) => b.date - a.date)
    .slice(0, 10)
    .map((p, i) => ({
      date: new Date(p.date).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }),
      counted: i < RUN_WEIGHTS.length,
      track: p.track,
      distance: p.distance,
      going: goingLabel(p.going),
      className: classOf(p.raceName),
      raceName: p.raceName || undefined,
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
      ...sectionsOf(p, todayDistance),
      points: Math.round(runPoints(p, todayPar, e.horse.age, asOf) * 10) / 10,
      raceKey: p.raceId ?? `${new Date(p.date).toISOString().slice(0, 10)}:${p.track ?? ""}:${p.raceNumber}`,
      raceId: p.raceId,
      meetingId: p.meetingId,
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

/**
 * The Group 1s the feed prints by name alone, with no grade on them. Only
 * races whose name says which race it is: a plain "Derby" or "Guineas"
 * could be anything from a Group 1 to a country feature and keeps its name.
 */
const GROUP_ONES = new Set([
  "australian derby", "victoria derby", "queensland derby", "south australian derby", "sa derby",
  "australian guineas", "caulfield guineas", "rosehill guineas", "randwick guineas", "thousand guineas",
  "australian oaks", "crown oaks", "vrc oaks", "queensland oaks", "australasian oaks",
  "cox plate", "golden slipper", "doncaster mile", "doncaster hcp", "epsom hcp", "melbourne cup", "caulfield cup", "sydney cup",
  "newmarket hcp", "blue diamond stakes", "coolmore stud stakes", "champions stakes", "mackinnon stakes", "lightning stakes", "black caviar lightning",
  "oakleigh plate", "futurity stakes", "c f orr stakes", "cf orr stakes", "orr stakes", "australian cup", "ranvet stakes", "george ryder stakes",
  "t j smith stakes", "tj smith stakes", "queen elizabeth stakes", "all aged stakes", "kingsford smith cup", "kingsford-smith cup", "stradbroke hcp",
  "j j atkins", "jj atkins", "tattersall's tiara", "tatts tiara", "winx stakes", "memsie stakes", "makybe diva stakes", "underwood stakes", "turnbull stakes",
  "toorak hcp", "might and power stakes", "manikato stakes", "moir stakes", "sir rupert clarke stakes", "george main stakes", "flight stakes",
  "spring champion stakes", "the metropolitan", "metropolitan hcp", "railway stakes", "kingston town classic", "winterbottom stakes", "northerly stakes",
  "canterbury stakes", "surround stakes", "chipping norton stakes", "coolmore classic", "vinery stud stakes", "inglis sires", "sires produce stakes",
  "champagne stakes", "robert sangster stakes", "the goodwood", "goodwood hcp", "doomben cup", "doomben 10,000", "doomben 10000", "cantala stakes",
  "empire rose stakes", "champions sprint", "champions mile", "myer classic", "william reid stakes", "kennedy oaks",
]);

/** "Australian Derby" → "G1"; a feature race the table does not name is undefined. */
function groupOf(name: string): string | undefined {
  const plain = name.toLowerCase().replace(/^\d(?:,\d)*yo\+?\s+/, "").replace(/\s+/g, " ").trim();
  return GROUP_ONES.has(plain) ? "G1" : undefined;
}

/** "Midway (Bm72)" → "Bm72", "3yo+ Mdn Plate" → "Mdn", "Australian Derby" → "G1", else the name trimmed. */
function classOf(name?: string): string | undefined {
  if (!name) return undefined;
  const bm = name.match(/\((bm\s?\d+|[^)]*)\)/i);
  if (bm) return bm[1].replace(/\s+/g, "");
  // Before the keywords: the Epsom is a Group 1, not a "Hcp".
  const group = groupOf(name);
  if (group) return group;
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
      // A lay's price is the exchange price, a bet's the bookmakers' best.
      marketPrice: callPrice(pick.runner) ?? pick.runner.marketPrice,
      bookies: pick.runner.signal === "lay" ? undefined : pick.runner.bookies,
      marketAvg: pick.runner.marketAvg,
      marketOpen: pick.runner.marketOpen,
      marketMove: pick.runner.marketMove,
      marketAt: pick.runner.marketAt,
      edge: callEdge(pick.runner) ?? pick.runner.edge,
      finishPosition: pick.race.result ? pick.runner.finishPosition : undefined,
      jumpTime: pick.race.jumpTime,
    });
  };

  // Prime Overlays: every bet five points clear on a horse we give a real
  // chance and a rating with two runs behind it, biggest first. There is no
  // Overlay of the Day any more: nothing is lime for being merely the best
  // of the day, and a day with no Prime has none.
  for (const c of [...qualifying]
    .filter((c) => (c.runner.edge ?? 0) >= PRIME_EDGE && c.runner.ratedProbability >= PRIME_MIN_PROB && (c.runner.ratings.trust ?? 1) >= LAY_TRUST_FLOOR)
    .sort((a, b) => (b.runner.edge ?? 0) - (a.runner.edge ?? 0))) {
    take("prime_overlay", [c], () => 0);
  }

  // Way Overlays: every bet at a roughie's price, biggest edge first.
  for (const c of [...qualifying].filter((c) => (c.runner.marketPrice ?? 0) >= ROUGHIE_FROM && !used.has(key(c))).sort((a, b) => (b.runner.edge ?? 0) - (a.runner.edge ?? 0))) take("way_overlay", [c], () => 0);

  // Long overlay: best edge at a genuine each-way price, short of a roughie's.
  take(
    "long_overlay",
    qualifying.filter((c) => (c.runner.marketPrice ?? 0) >= LONG_MIN_PRICE),
    (a, b) => (b.runner.edge ?? 0) - (a.runner.edge ?? 0),
  );

  // Then every other bet, biggest edge first, and every lay, shortest first,
  // so the home page shows the whole day's calls and not just the headliners.
  for (const c of [...qualifying].filter((c) => !used.has(key(c))).sort((a, b) => (b.runner.edge ?? 0) - (a.runner.edge ?? 0))) take("bet", [c], () => 0);
  for (const c of pool.filter((x) => x.runner.signal === "lay").sort((a, b) => (callEdge(a.runner) ?? 0) - (callEdge(b.runner) ?? 0))) take("lay", [c], () => 0);

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
