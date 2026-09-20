import "server-only";

import { getHorse } from "@/lib/formking/client";
import type { PastEvent, SectionKey } from "@/lib/formking/types";
import { supabaseAdmin } from "@/lib/billing/access";
import { clockPoints, TEMPO_LENGTHS } from "./ratings";
import { readStoredCard, type StoredCard } from "./store";
import { stakeOf, type PublishedMeeting, type PublishedRace, type PublishedRunner, type Tempo } from "./types";
import { settle } from "@/lib/tips";

/**
 * The Saturday review. After the day, each runner's own run is bought from
 * the Form King horse endpoint (2 credits) and kept in review_runs, once.
 * The page then reads how every horse ran against the class benchmark next
 * to the mark we had it at before the race.
 *
 * Which runners: every runner at NSW and VIC meetings, plus the ten best
 * bets and ten best lays across the whole card.
 */

const REVIEW_STATES = new Set(["NSW", "VIC"]);
/** A length is about a sixth of a second, the convention the standards use too. */
const SECONDS_PER_LENGTH = 0.167;
const TOP_CALLS = 10;
/** Starts per second stay under Form King's 300 per 300 s with room for the live poll. */
const REQUEST_GAP_MS = 1100;

export type Stage = "FULL_SECTIONAL_DATA" | "OVERALL_AND_600_SECTIONAL" | "OVERALL_TIME_ONLY" | "SECT_NO_BM" | "NONE" | "NOT_FOUND" | string;

export interface ReviewSection {
  /** Lengths vs the class benchmark over that section, positive is faster. */
  vsClass: number;
  vsLeader: number;
  rank?: number;
}

/** One run as the review keeps it. Form King's benchmarks: admin eyes only. */
export interface ReviewRun {
  stage: Stage;
  finish?: number;
  margin?: number;
  runners?: number;
  /**
   * The race's time and the winner's last 600, seconds: the feed sends the
   * same figure to every runner in the race, not each horse's own clock.
   */
  time?: number;
  last600?: number;
  posSettling?: number;
  pos800?: number;
  pos400?: number;
  /** Lengths vs class over the whole race. */
  vsClass?: number;
  /** Last 600m speed as a percentage of speed to the 600m. */
  finishingSpeed?: number;
  speedRating?: number;
  sections?: Partial<Record<SectionKey, ReviewSection>>;
}

export interface StoredRun {
  horseId: string;
  raceId: string;
  meetingId: string;
  tabNumber: number;
  run: ReviewRun | null;
  fetchedAt: string;
}

interface Wanted {
  meetingId: string;
  raceId: string;
  tabNumber: number;
  horseName: string;
  horseId?: string;
}

const isFull = (r: ReviewRun | null | undefined) => r?.stage === "FULL_SECTIONAL_DATA";

/** What a fetch buys: every wanted runner, or only the calls. */
export type FetchScope = "all" | "calls";

/** The runners the review buys for a card. With `calls`, only the bets and lays, wherever they are. */
export function wantedRunners(card: StoredCard, scope: FetchScope = "all"): Wanted[] {
  const out = new Map<string, Wanted>();
  const add = (m: PublishedMeeting, r: PublishedRace, x: PublishedRunner) => {
    if (x.scratched) return;
    out.set(`${r.raceId}:${x.tabNumber}`, { meetingId: m.meetingId, raceId: r.raceId, tabNumber: x.tabNumber, horseName: x.horseName, horseId: x.horseId });
  };
  const calls: { m: PublishedMeeting; r: PublishedRace; x: PublishedRunner }[] = [];
  for (const m of card.meetings) {
    for (const r of m.races) {
      for (const x of r.runners) {
        if (scope === "all" && REVIEW_STATES.has(m.state)) add(m, r, x);
        if (x.signal && !x.scratched) calls.push({ m, r, x });
      }
    }
  }
  if (scope === "calls") {
    for (const c of calls) if (c.x.marketPrice) add(c.m, c.r, c.x);
    return [...out.values()];
  }
  const bets = calls.filter((c) => c.x.signal === "back").sort((a, b) => (b.x.edge ?? 0) - (a.x.edge ?? 0)).slice(0, TOP_CALLS);
  const lays = calls.filter((c) => c.x.signal === "lay").sort((a, b) => (a.x.edge ?? 0) - (b.x.edge ?? 0)).slice(0, TOP_CALLS);
  for (const c of [...bets, ...lays]) add(c.m, c.r, c.x);
  return [...out.values()];
}

/** Breeding ids for runners published before the card carried them, from the horse store by name. */
async function resolveIds(wanted: Wanted[]): Promise<Wanted[]> {
  const missing = wanted.filter((w) => !w.horseId);
  if (missing.length === 0) return wanted;
  const names = [...new Set(missing.map((w) => w.horseName))];
  const found = new Map<string, { id: string; seen: string }>();
  for (let i = 0; i < names.length; i += 100) {
    const { data } = await supabaseAdmin().from("horses").select("id, name, last_seen").in("name", names.slice(i, i + 100));
    for (const h of data ?? []) {
      const key = String(h.name).toLowerCase();
      const seen = String(h.last_seen);
      if (!found.has(key) || found.get(key)!.seen < seen) found.set(key, { id: String(h.id), seen });
    }
  }
  return wanted.map((w) => (w.horseId ? w : { ...w, horseId: found.get(w.horseName.toLowerCase())?.id }));
}

export async function readReview(date: string): Promise<Map<string, StoredRun>> {
  const { data, error } = await supabaseAdmin().from("review_runs").select("horse_id, race_id, meeting_id, tab_number, run, fetched_at").eq("date", date);
  if (error) console.error("[review]", error.message);
  return new Map(
    (data ?? []).map((r) => [
      String(r.horse_id),
      { horseId: String(r.horse_id), raceId: String(r.race_id), meetingId: String(r.meeting_id), tabNumber: Number(r.tab_number), run: (r.run as ReviewRun | null) ?? null, fetchedAt: String(r.fetched_at) },
    ]),
  );
}

/** Dates that hold review runs, newest first. */
export async function reviewedDates(): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin().from("review_runs").select("date");
  const out = new Map<string, number>();
  for (const r of data ?? []) out.set(String(r.date), (out.get(String(r.date)) ?? 0) + 1);
  return out;
}

/** How many bets and lays a date has, and how many already have their run. */
export interface CallsStatus {
  date: string;
  calls: number;
  fetched: number;
}

/** The calls on each date on file against the runs bought, for the index. */
export async function callsStatus(dates: string[]): Promise<CallsStatus[]> {
  return Promise.all(
    dates.map(async (date) => {
      const [stored, runs] = await Promise.all([readStoredCard(date), readReview(date)]);
      if (!stored) return { date, calls: 0, fetched: 0 };
      const calls = wantedRunners(stored.card, "calls");
      const fetched = calls.filter((c) => c.horseId && runs.has(c.horseId)).length;
      return { date, calls: calls.length, fetched };
    }),
  );
}

const sydneyDate = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

/** The run on the review date, trimmed to what the page reads. */
function runOf(events: PastEvent[], date: string, raceId: string): ReviewRun | null {
  const p = events.find((e) => e.race && e.raceId === raceId) ?? events.find((e) => e.race && sydneyDate(e.date) === date);
  if (!p) return null;
  const b = p.benchmark;
  const sections: ReviewRun["sections"] = {};
  for (const [k, s] of Object.entries(b?.sections ?? {})) {
    if (s) sections[k as SectionKey] = { vsClass: s.vsClass, vsLeader: s.vsLeader, rank: s.raceRank };
  }
  return {
    stage: b?.dataStage ?? (p.sectionalTimeInMillis ? "SECT_NO_BM" : "NONE"),
    finish: p.finishPosition,
    margin: p.margin,
    runners: p.numRunners,
    time: p.timeInMillis ? Math.round(p.timeInMillis / 10) / 100 : undefined,
    last600: p.sectionalTimeInMillis && p.sectionalDistance === 600 ? Math.round(p.sectionalTimeInMillis / 10) / 100 : undefined,
    posSettling: p.posSettling,
    pos800: p.pos800m,
    pos400: p.pos400m,
    vsClass: b?.vsClass,
    finishingSpeed: b?.finishingSpeed,
    speedRating: b?.speedRating,
    sections: Object.keys(sections).length ? sections : undefined,
  };
}

export interface FetchProgress {
  /** Bought this call. */
  fetched: number;
  /** Still to buy; call again while this is above zero. */
  remaining: number;
  /** Runners whose horse we could not identify, so they are skipped. */
  unknown: number;
  credits: number;
}

/**
 * Buys the runs still missing for a date, paced for the rate limit, until
 * the time budget is spent. With `refresh`, runs bought before the
 * benchmarks were finished are bought again.
 */
export async function fetchReviewBatch(date: string, opts: { budgetMs?: number; refresh?: boolean; scope?: FetchScope; raceId?: string } = {}): Promise<FetchProgress> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 240_000;
  const stored = await readStoredCard(date);
  if (!stored) throw new Error(`No card for ${date}.`);
  // One race on its own buys every runner in it, wanted or not.
  const wanted = await resolveIds(
    opts.raceId
      ? stored.card.meetings.flatMap((m) => m.races.filter((r) => r.raceId === opts.raceId).flatMap((r) => r.runners.filter((x) => !x.scratched).map((x) => ({ meetingId: m.meetingId, raceId: r.raceId, tabNumber: x.tabNumber, horseName: x.horseName, horseId: x.horseId }))))
      : wantedRunners(stored.card, opts.scope),
  );
  const have = await readReview(date);
  const known = wanted.filter((w): w is Wanted & { horseId: string } => Boolean(w.horseId));
  const due = known.filter((w) => {
    const s = have.get(w.horseId);
    if (!s) return true;
    return Boolean(opts.refresh) && !isFull(s.run);
  });
  let fetched = 0;
  let credits = 0;
  let lastStart = 0;
  for (const w of due) {
    if (Date.now() - started > budget) break;
    const wait = lastStart + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
    let run: ReviewRun | null;
    try {
      const form = await getHorse(w.horseId);
      credits += 2;
      run = runOf(form.pastEvents ?? [], date, w.raceId) ?? { stage: "NOT_FOUND" };
    } catch (err) {
      console.error("[review] horse fetch failed", w.horseId, err);
      // Credits gone means stop now, anything else moves on to the next horse.
      if (err instanceof Error && /402|exhausted/.test(err.message)) throw err;
      continue;
    }
    const { error } = await supabaseAdmin().from("review_runs").upsert(
      { date, horse_id: w.horseId, race_id: w.raceId, meeting_id: w.meetingId, tab_number: w.tabNumber, run, fetched_at: new Date().toISOString() },
      { onConflict: "date,horse_id" },
    );
    if (error) console.error("[review]", error.message);
    else fetched++;
  }
  return { fetched, remaining: Math.max(0, due.length - fetched), unknown: wanted.length - known.length, credits };
}

/* ---------- The brief ---------- */

export interface ReviewedRunner {
  runner: PublishedRunner;
  run?: ReviewRun | null;
  /** Points the run was worth on our scale: class par plus lengths vs class. */
  ranTo?: number;
  /**
   * What we expected the horse to run to: the race's par plus how far its
   * mark sat above or below the field's average mark. A three-year-old field
   * marked in the 80s for a Group 3 at 97 reads against the 97, so the gap
   * says how the horse ran against the race, not against a scale.
   */
  expected: number;
  /** ranTo minus expected. */
  gap?: number;
  /**
   * The gap less the race's mean gap: how the horse ran against its place in
   * our order, with the race's own par taken out. A field marked in the 70s
   * that all ran to a Listed par shows a big gap and a small relative one.
   */
  relGap?: number;
  finish?: number;
  margin?: number;
  sp?: number;
  /** Lengths vs class over the first section and the last 600. */
  early?: number;
  late?: number;
  lateRank?: number;
  /** The horse's own clocks, seconds, read off the winner's by the margin and by the last-600 lengths against class. */
  ownTime?: number;
  ownLast600?: number;
}

export interface ReviewedRace {
  meeting: PublishedMeeting;
  race: PublishedRace;
  runners: ReviewedRunner[];
  /** How many runners have a fully benchmarked run. */
  full: number;
  wanted: boolean;
  /** Mean lengths vs class of the first three home, positive is a strong race. */
  strength?: number;
  winnerRanTo?: number;
  /** Mean of ran-to minus expected over the benchmarked runners, and the mean size of that gap. */
  bias?: number;
  spread?: number;
  /** How many of the first four home sat in our top four. */
  ourFour?: number;
  /**
   * The benchmark cannot be trusted: the first three all ran five lengths
   * above class, or a placegetter has a single 200m sector more than six
   * lengths above it, which no horse does and a misplaced timing point does.
   */
  suspect: boolean;
  /** The leader's first section against class, and the tempo that makes it. */
  leaderEarly?: number;
  tempo?: Tempo;
  /** Mean places between where we mapped each runner and where it settled, over the runners with a settling position. */
  mapFit?: number;
  /** Whether the runner we mapped to lead did lead. */
  leaderLed?: boolean;
}

export interface LedgerRow extends ReviewedRunner {
  meeting: PublishedMeeting;
  race: PublishedRace;
  /** The race as reviewed, for how it was run. */
  reviewed: ReviewedRace;
  side: "back" | "lay";
  tag?: string;
  units?: number;
}

/** How the model went at one meeting, over the runners with a full benchmark. */
export interface MeetingStats {
  meeting: PublishedMeeting;
  races: number;
  runners: number;
  /** Runners with a fully benchmarked run. */
  full: number;
  /** Mean of ran-to minus expected: positive means the meeting ran above what we expected. */
  bias?: number;
  /** Mean size of the gap, either way. */
  spread?: number;
  /** Mean size of the relative gap: how far runners strayed from their place in our order. */
  relSpread?: number;
  /** Pearson correlation of our expected mark with ran-to, over the benchmarked runners. */
  fit?: number;
  /** Where the winners settled on average, and where the first three home did: how the track played. */
  winnerSettled?: number;
  placedSettled?: number;
  /** Races with a winner, and how many of those winners sat in our top four, or were our top-rated. */
  resulted: number;
  winnersInFour: number;
  topRatedWon: number;
  /** Of the first three home across the resulted races, how many sat in our top four. */
  placedInFour: number;
  placed: number;
  bets: number;
  betUnits: number;
  lays: number;
  layUnits: number;
}

/** One sentence for the weekly write-up, with the runner behind it. */
export interface TalkingPoint {
  kind: "run of the day" | "under the radar" | "disappointing" | "improver";
  /** Why it is here, in a few words; the numbers sit in the row beside it. */
  text: string;
  runner: ReviewedRunner & { race: ReviewedRace };
}

/** A Group race and how our numbers went in it. */
export interface FeatureRace {
  race: ReviewedRace;
  /** "Group 1", "Group 2", "Group 3". */
  grade: string;
  winner?: ReviewedRunner;
  /** Our top-rated runner and where it finished. */
  topRated?: ReviewedRunner;
  /** The first three home with the mark we had them at and where we ranked them. */
  placings: ReviewedRunner[];
  calls: ReviewedRunner[];
  units?: number;
}

export interface Review {
  date: string;
  builtAt: string;
  card: StoredCard;
  races: ReviewedRace[];
  /** The Group races of the day, highest grade first. */
  features: FeatureRace[];
  /** One row per meeting, fullest data first. */
  meetings: MeetingStats[];
  /** The day in sentences: the best run, the ones that slipped under the radar, the disappointments. */
  talking: TalkingPoint[];
  /** Races with a benchmarked winner, strongest first. */
  ranking: ReviewedRace[];
  best: (ReviewedRunner & { race: ReviewedRace })[];
  closers: (ReviewedRunner & { race: ReviewedRace })[];
  bets: LedgerRow[];
  lays: LedgerRow[];
  counts: { wanted: number; fetched: number; full: number; partial: number; missing: number; credits: number; /** Calls without a run yet. */ callsMissing: number };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Lengths above class in one 200m sector beyond which the timing, not the
 * horse, is the story. Only the fast side: a tired horse runs its last 200m
 * ten lengths slow all the time, nothing runs a 200m sector six lengths fast.
 */
const SECTOR_LIMIT = 6;
const SECTOR = /^(\d+)-(\d+|F)$/;

/** Whether a run has a 200m sector no horse could run: a misplaced timing point. */
function impossibleSector(run?: ReviewRun | null): boolean {
  for (const [name, sec] of Object.entries(run?.sections ?? {})) {
    const m = SECTOR.exec(name);
    if (!m) continue;
    const from = Number(m[1]), to = m[2] === "F" ? 0 : Number(m[2]);
    if (from - to !== 2) continue;
    if (sec.vsClass > SECTOR_LIMIT) return true;
  }
  return false;
}

function pearson(pairs: [number, number][]): number | undefined {
  if (pairs.length < 4) return undefined;
  const mx = mean(pairs.map((p) => p[0])), my = mean(pairs.map((p) => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : undefined;
}

/**
 * The write-up. Run of the day is the highest run against class. Under the
 * radar is a run in the top ten that finished out of the placings or went
 * around at $10 or more, so the form guide will not show it. Disappointing
 * is a horse we or the market fancied (our top four, or $5 or under) that
 * ran three or more points below its place in our order. Improver is the
 * biggest gap above it. The text says why the horse is here; the page
 * lays the result and the numbers out beside it.
 */
function talkingPoints(withRace: (ReviewedRunner & { race: ReviewedRace })[]): TalkingPoint[] {
  const out: TalkingPoint[] = [];
  // A race whose first three all ran five lengths above class is a benchmark
  // that has not settled, not five good horses: it stays out of the superlatives.
  const sane = withRace.filter((r) => !r.race.suspect && r.ranTo !== undefined);
  const byVsClass = [...sane].sort((a, b) => b.run!.vsClass! - a.run!.vsClass!);
  const top = byVsClass[0];
  if (top && top.run!.vsClass! > 0) {
    out.push({ kind: "run of the day", runner: top, text: "The best run of the day against class." });
  }
  const seenRace = new Set<string>();
  for (const r of byVsClass) {
    if (r === top || seenRace.has(r.race.race.raceId)) continue;
    if ((r.finish && r.finish > 3) || (r.sp && r.sp >= 10)) {
      seenRace.add(r.race.race.raceId);
      out.push({ kind: "under the radar", runner: r, text: r.finish && r.finish > 3 ? "Out of the placings, so the form guide hides the run." : "Went around at double figures, so the form guide hides the run." });
      if (out.filter((t) => t.kind === "under the radar").length >= 3) break;
    }
  }
  // Against the field: the relative gap takes the race's own level out, so
  // a horse beaten two lengths in a race run eight under par is not blamed
  // for the race.
  const level = (r: ReviewedRunner & { race: ReviewedRace }) => (r.race.bias !== undefined && Math.abs(r.race.bias) >= 3 ? ` The race was run ${Math.abs(r.race.bias).toFixed(1)} points ${r.race.bias > 0 ? "above" : "below"} par.` : "");
  const fancied = sane.filter((r) => r.relGap !== undefined && r.runner.ratings.runs >= 2 && (r.runner.rank || (r.sp && r.sp <= 5)));
  for (const r of [...fancied].filter((r) => r.relGap! <= -3).sort((a, b) => a.relGap! - b.relGap!).slice(0, 3)) {
    out.push({ kind: "disappointing", runner: r, text: `${r.runner.rank ? `Our #${r.runner.rank}` : "Fancied by the market"}, and ran well below its place in our order.${level(r)}` });
  }
  const improver = [...sane].filter((r) => r.relGap !== undefined && r.runner.ratings.runs >= 2 && !out.some((t) => t.runner === r)).sort((a, b) => b.relGap! - a.relGap!)[0];
  if (improver && improver.relGap! >= 3) {
    out.push({ kind: "improver", runner: improver, text: `The biggest step up on our numbers.${level(improver)}` });
  }
  return out;
}

const GRADE = /^group\s*([123])$/i;

function featureRaces(races: ReviewedRace[]): FeatureRace[] {
  return races
    .map((race) => ({ race, m: GRADE.exec(race.race.className ?? "") }))
    .filter((x): x is { race: ReviewedRace; m: RegExpExecArray } => Boolean(x.m))
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]) || a.race.race.classPoints - b.race.race.classPoints)
    .map(({ race, m }) => {
      const winner = race.runners.find((r) => r.finish === 1);
      const topRated = [...race.runners].sort((a, b) => b.runner.ratings.today - a.runner.ratings.today)[0];
      const placings = race.runners.filter((r) => r.finish && r.finish <= 3).sort((a, b) => a.finish! - b.finish!);
      const calls = race.runners.filter((r) => r.runner.signal && r.runner.marketPrice);
      const settled = calls.filter((r) => r.finish !== undefined);
      return {
        race,
        grade: `G${m[1]}`,
        winner,
        topRated,
        placings,
        calls,
        units: settled.length ? round1(settled.reduce((a, r) => a + settle(r.runner.signal!, r.runner.marketPrice!, r.finish!, stakeOf(r.runner)), 0)) : undefined,
      };
    });
}

function meetingStats(races: ReviewedRace[], bets: LedgerRow[], lays: LedgerRow[]): MeetingStats[] {
  const byMeeting = new Map<string, ReviewedRace[]>();
  for (const r of races) byMeeting.set(r.meeting.meetingId, [...(byMeeting.get(r.meeting.meetingId) ?? []), r]);
  return [...byMeeting.values()]
    .map((rs) => {
      const meeting = rs[0].meeting;
      const runners = rs.flatMap((r) => r.runners);
      const fullRunners = rs.filter((r) => !r.suspect).flatMap((r) => r.runners).filter((r) => isFull(r.run) && r.gap !== undefined);
      const gaps = fullRunners.map((r) => r.gap!);
      const resulted = rs.filter((r) => r.runners.some((x) => x.finish === 1));
      const winners = resulted.map((r) => r.runners.find((x) => x.finish === 1)!);
      const topRated = resulted.map((r) => [...r.runners].sort((a, b) => b.runner.ratings.today - a.runner.ratings.today)[0]);
      const placegetters = resulted.flatMap((r) => r.runners.filter((x) => x.finish && x.finish <= 3));
      const mine = (rows: LedgerRow[]) => rows.filter((b) => b.meeting.meetingId === meeting.meetingId && b.units !== undefined);
      const b = mine(bets), l = mine(lays);
      const settledOf = (rows: ReviewedRunner[]) => rows.map((r) => r.run?.posSettling).filter((p): p is number => Boolean(p));
      const winnerSettled = settledOf(winners);
      const placedSettled = settledOf(runners.filter((r) => r.finish && r.finish <= 3));
      return {
        meeting,
        races: rs.length,
        runners: runners.length,
        full: fullRunners.length,
        winnerSettled: winnerSettled.length ? round1(mean(winnerSettled)) : undefined,
        placedSettled: placedSettled.length ? round1(mean(placedSettled)) : undefined,
        bias: gaps.length ? round1(mean(gaps)) : undefined,
        spread: gaps.length ? round1(mean(gaps.map(Math.abs))) : undefined,
        relSpread: gaps.length ? round1(mean(fullRunners.map((r) => Math.abs(r.relGap ?? 0)))) : undefined,
        fit: pearson(fullRunners.map((r) => [r.expected, r.ranTo!] as [number, number])),
        resulted: resulted.length,
        winnersInFour: winners.filter((w) => w.runner.rank).length,
        topRatedWon: topRated.filter((t) => t.finish === 1).length,
        placedInFour: placegetters.filter((r) => r.runner.rank).length,
        placed: placegetters.length,
        bets: b.length,
        betUnits: round1(b.reduce((a, x) => a + x.units!, 0)),
        lays: l.length,
        layUnits: round1(l.reduce((a, x) => a + x.units!, 0)),
      };
    })
    .sort((a, b) => b.full / Math.max(1, b.runners) - a.full / Math.max(1, a.runners) || b.full - a.full);
}

function firstSection(run?: ReviewRun | null): ReviewSection | undefined {
  const s = run?.sections;
  if (!s) return undefined;
  return s["S-12"] ?? s["S-10"] ?? s["S-8"] ?? s["S-6"];
}

function lastSection(run?: ReviewRun | null): ReviewSection | undefined {
  const s = run?.sections;
  if (!s) return undefined;
  return s["6-F"] ?? s["4-F"] ?? s["2-F"];
}

export async function buildReview(date: string): Promise<Review | undefined> {
  const stored = await readStoredCard(date);
  if (!stored) return undefined;
  const card = stored.card;
  const runs = await readReview(date);
  const byRunner = new Map<string, StoredRun>();
  for (const s of runs.values()) byRunner.set(`${s.raceId}:${s.tabNumber}`, s);
  const wanted = new Set(wantedRunners(card).map((w) => `${w.raceId}:${w.tabNumber}`));
  const tagOf = new Map(card.selections.map((s) => [`${s.raceId}:${s.tabNumber}`, s.tag]));

  const races: ReviewedRace[] = [];
  const bets: LedgerRow[] = [];
  const lays: LedgerRow[] = [];
  for (const meeting of card.meetings) {
    for (const race of meeting.races) {
      const par = race.classPoints;
      const live = race.runners.filter((x) => !x.scratched);
      const fieldMark = live.length ? mean(live.map((x) => x.ratings.today)) : par;
      const runners: ReviewedRunner[] = live
        .map((runner) => {
          const key = `${race.raceId}:${runner.tabNumber}`;
          const run = byRunner.get(key)?.run;
          const placing = race.placings?.find((p) => p.tabNumber === runner.tabNumber);
          const ranTo = run?.vsClass !== undefined ? round1(par + run.vsClass * clockPoints(race.distance)) : undefined;
          const expected = round1(par + runner.ratings.today - fieldMark);
          const early = firstSection(run);
          const late = lastSection(run);
          const margin = run?.margin ?? placing?.margin;
          const finish = run?.finish ?? runner.finishPosition;
          // The feed gives the winner its winning margin, so the winner is on the race's time.
          const beaten = finish === 1 ? 0 : margin;
          return {
            runner,
            run: byRunner.has(key) ? run : undefined,
            ranTo,
            expected,
            gap: ranTo !== undefined ? round1(ranTo - expected) : undefined,
            finish,
            margin,
            sp: placing?.sp,
            early: early?.vsClass,
            late: late?.vsClass,
            lateRank: late?.rank,
            ownTime: run?.time !== undefined && beaten !== undefined ? round2(run.time + beaten * SECONDS_PER_LENGTH) : undefined,
          };
        })
        .sort((a, b) => (a.finish || 99) - (b.finish || 99) || a.runner.tabNumber - b.runner.tabNumber);
      // Each horse's own last 600 off the winner's clock: the feed sends the
      // winner's time to every runner, and each runner's lengths against the
      // class benchmark over that section say how far behind or ahead of the
      // winner's it was.
      const first = runners.find((r) => r.finish === 1);
      const winnerLate = lastSection(first?.run)?.vsClass;
      if (first?.run?.last600 !== undefined && winnerLate !== undefined) {
        for (const r of runners) {
          const vs = lastSection(r.run)?.vsClass;
          if (vs !== undefined) r.ownLast600 = round2(first.run.last600 + (winnerLate - vs) * SECONDS_PER_LENGTH);
        }
      }
      const full = runners.filter((r) => isFull(r.run)).length;
      const gaps = runners.filter((r) => isFull(r.run) && r.gap !== undefined).map((r) => r.gap!);
      if (gaps.length) {
        const raceBias = mean(gaps);
        for (const r of runners) if (isFull(r.run) && r.gap !== undefined) r.relGap = round1(r.gap - raceBias);
      }
      const placed = runners.filter((r) => isFull(r.run) && r.finish && r.finish <= 3 && r.run?.vsClass !== undefined);
      const strength = placed.length ? round1(mean(placed.map((r) => r.run!.vsClass!))) : undefined;
      const suspect = (strength ?? 0) >= 5 || placed.some((r) => impossibleSector(r.run));
      const winner = runners.find((r) => r.finish === 1);
      const firstFour = runners.filter((r) => r.finish && r.finish <= 4);
      const ourFour = firstFour.length === 4 ? firstFour.filter((r) => r.runner.rank && r.runner.rank <= 4).length : undefined;
      const anyFirst = runners.map((r) => firstSection(r.run)).find(Boolean);
      const leaderEarly = anyFirst ? round1(anyFirst.vsClass - anyFirst.vsLeader) : undefined;
      const tempo: Tempo | undefined = leaderEarly === undefined ? undefined : leaderEarly >= TEMPO_LENGTHS ? "fast" : leaderEarly <= -TEMPO_LENGTHS ? "slow" : "even";
      // Our map against where the field settled, on the positions the card showed.
      const settledRunners = runners.filter((r) => r.run?.posSettling && r.runner.ratings.ppir);
      const mapFit = settledRunners.length ? round1(mean(settledRunners.map((r) => Math.abs(r.run!.posSettling! - r.runner.ratings.ppir)))) : undefined;
      const ourLeader = settledRunners.find((r) => r.runner.ratings.ppir === 1);
      const leaderLed = ourLeader ? ourLeader.run!.posSettling === 1 : undefined;
      const reviewed: ReviewedRace = {
        meeting,
        race,
        runners,
        full,
        wanted: runners.some((r) => wanted.has(`${race.raceId}:${r.runner.tabNumber}`)),
        strength,
        suspect,
        winnerRanTo: winner?.ranTo,
        bias: gaps.length ? round1(mean(gaps)) : undefined,
        spread: gaps.length ? round1(mean(gaps.map(Math.abs))) : undefined,
        ourFour,
        leaderEarly,
        tempo,
        mapFit,
        leaderLed,
      };
      races.push(reviewed);
      for (const r of runners) {
        const x = r.runner;
        if (!x.signal || !x.marketPrice) continue;
        const row: LedgerRow = {
          ...r,
          meeting,
          race,
          reviewed,
          side: x.signal,
          tag: tagOf.get(`${race.raceId}:${x.tabNumber}`),
          units: r.finish !== undefined ? settle(x.signal, x.marketPrice, r.finish, stakeOf(x)) : undefined,
        };
        (x.signal === "back" ? bets : lays).push(row);
      }
    }
  }
  bets.sort((a, b) => (b.runner.edge ?? 0) - (a.runner.edge ?? 0));
  lays.sort((a, b) => (a.runner.edge ?? 0) - (b.runner.edge ?? 0));

  const withRace = races.flatMap((race) => race.runners.filter((r) => isFull(r.run) && r.run?.vsClass !== undefined).map((r) => ({ ...r, race })));
  const byVsClass = withRace.filter((r) => !r.race.suspect).sort((a, b) => b.run!.vsClass! - a.run!.vsClass!);
  const closers = withRace.filter((r) => !r.race.suspect && r.late !== undefined).sort((a, b) => b.late! - a.late!);
  const fetched = [...runs.values()];
  return {
    date,
    builtAt: stored.builtAt,
    card,
    races,
    meetings: meetingStats(races, bets, lays),
    features: featureRaces(races),
    talking: talkingPoints(withRace),
    ranking: races.filter((r) => r.strength !== undefined).sort((a, b) => b.strength! - a.strength!),
    best: byVsClass.slice(0, 10),
    closers: closers.slice(0, 10),
    bets,
    lays,
    counts: {
      wanted: wanted.size,
      fetched: fetched.length,
      full: fetched.filter((s) => isFull(s.run)).length,
      partial: fetched.filter((s) => !isFull(s.run)).length,
      missing: Math.max(0, wanted.size - fetched.length),
      credits: fetched.length * 2,
      callsMissing: [...bets, ...lays].filter((r) => r.run === undefined).length,
    },
  };
}
