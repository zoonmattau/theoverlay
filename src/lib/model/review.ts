import "server-only";

import { getHorse } from "@/lib/formking/client";
import type { PastEvent, SectionKey } from "@/lib/formking/types";
import { supabaseAdmin } from "@/lib/billing/access";
import { clockPoints, TEMPO_LENGTHS } from "./ratings";
import { readStoredCard, type StoredCard } from "./store";
import type { PublishedMeeting, PublishedRace, PublishedRunner, Tempo } from "./types";
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
  /** Seconds. */
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

/** The runners the review buys for a card. */
export function wantedRunners(card: StoredCard): Wanted[] {
  const out = new Map<string, Wanted>();
  const add = (m: PublishedMeeting, r: PublishedRace, x: PublishedRunner) => {
    if (x.scratched) return;
    out.set(`${r.raceId}:${x.tabNumber}`, { meetingId: m.meetingId, raceId: r.raceId, tabNumber: x.tabNumber, horseName: x.horseName, horseId: x.horseId });
  };
  const calls: { m: PublishedMeeting; r: PublishedRace; x: PublishedRunner }[] = [];
  for (const m of card.meetings) {
    for (const r of m.races) {
      for (const x of r.runners) {
        if (REVIEW_STATES.has(m.state)) add(m, r, x);
        if (x.signal && !x.scratched) calls.push({ m, r, x });
      }
    }
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
export async function fetchReviewBatch(date: string, opts: { budgetMs?: number; refresh?: boolean } = {}): Promise<FetchProgress> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 240_000;
  const stored = await readStoredCard(date);
  if (!stored) throw new Error(`No card for ${date}.`);
  const wanted = await resolveIds(wantedRunners(stored.card));
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
  /** ranTo minus the mark we priced off. */
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
  /** Mean of ran-to minus our mark over the benchmarked runners, and the mean size of that gap. */
  bias?: number;
  spread?: number;
  /**
   * The benchmark cannot be trusted: the first three all ran five lengths
   * above class, or a placegetter has a single 200m sector more than six
   * lengths above it, which no horse does and a misplaced timing point does.
   */
  suspect: boolean;
  /** The leader's first section against class, and the tempo that makes it. */
  leaderEarly?: number;
  tempo?: Tempo;
}

export interface LedgerRow extends ReviewedRunner {
  meeting: PublishedMeeting;
  race: PublishedRace;
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
  /** Mean of ran-to minus our mark: positive means the meeting ran above our marks. */
  bias?: number;
  /** Mean size of the gap, either way. */
  spread?: number;
  /** Mean size of the relative gap: how far runners strayed from their place in our order. */
  relSpread?: number;
  /** Pearson correlation of our mark with ran-to, over the benchmarked runners. */
  fit?: number;
  /** Races with a winner, and how many of those winners sat in our top four, or were our top-rated. */
  resulted: number;
  winnersInFour: number;
  topRatedWon: number;
  topRatedPlaced: number;
  bets: number;
  betUnits: number;
  lays: number;
  layUnits: number;
}

/** One sentence for the weekly write-up, with the runner behind it. */
export interface TalkingPoint {
  kind: "run of the day" | "under the radar" | "disappointing" | "improver" | "on the mark";
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
  worst: (ReviewedRunner & { race: ReviewedRace })[];
  closers: (ReviewedRunner & { race: ReviewedRace })[];
  bets: LedgerRow[];
  lays: LedgerRow[];
  counts: { wanted: number; fetched: number; full: number; partial: number; missing: number; credits: number };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
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

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const lengths = (n: number) => `${Math.abs(n).toFixed(1)} ${Math.abs(n) === 1 ? "length" : "lengths"}`;
const money = (n?: number) => (n ? `$${n.toFixed(2)}` : "");

/**
 * The write-up. Run of the day is the highest run against class. Under the
 * radar is a run in the top ten that finished out of the placings or went
 * around at $10 or more, so the form guide will not show it. Disappointing
 * is a horse we or the market fancied (our top four, or $5 or under) that
 * ran three or more points below our mark. Improver is the biggest gap
 * above our mark. On the mark is how many of the fancied runners ran
 * within two points of the mark we had them at.
 */
function talkingPoints(withRace: (ReviewedRunner & { race: ReviewedRace })[]): TalkingPoint[] {
  const out: TalkingPoint[] = [];
  const where = (r: ReviewedRunner & { race: ReviewedRace }) => `${r.race.meeting.track} R${r.race.race.raceNumber}`;
  const result = (r: ReviewedRunner) => (r.finish === 1 ? "won" : r.finish ? `ran ${ordinal(r.finish)}${r.margin !== undefined ? `, beaten ${lengths(r.margin)}` : ""}` : "ran");
  // A race whose first three all ran five lengths above class is a benchmark
  // that has not settled, not five good horses: it stays out of the superlatives.
  const sane = withRace.filter((r) => !r.race.suspect && r.ranTo !== undefined);
  const byVsClass = [...sane].sort((a, b) => b.run!.vsClass! - a.run!.vsClass!);
  const top = byVsClass[0];
  if (top && top.run!.vsClass! > 0) {
    out.push({
      kind: "run of the day",
      runner: top,
      text: `${top.runner.horseName} put up the run of the day at ${where(top)}: ${lengths(top.run!.vsClass!)} better than the class benchmark, a run worth ${top.ranTo?.toFixed(1)} against the ${top.runner.ratings.today.toFixed(1)} we had it at, and ${result(top)}${top.sp ? ` at ${money(top.sp)}` : ""}.`,
    });
  }
  const seenRace = new Set<string>();
  for (const r of byVsClass) {
    if (r === top || seenRace.has(r.race.race.raceId)) continue;
    if ((r.finish && r.finish > 3) || (r.sp && r.sp >= 10)) {
      seenRace.add(r.race.race.raceId);
      out.push({
        kind: "under the radar",
        runner: r,
        text: `${r.runner.horseName} slipped under the radar: ${result(r)}${r.sp ? ` at ${money(r.sp)}` : ""} at ${where(r)}, but ran to ${r.ranTo?.toFixed(1)}, ${lengths(r.run!.vsClass!)} above class${r.gap !== undefined ? ` and ${Math.abs(r.gap).toFixed(1)} points ${r.gap >= 0 ? "above" : "below"} our mark` : ""}.`,
      });
      if (out.filter((t) => t.kind === "under the radar").length >= 3) break;
    }
  }
  // Against the field: the relative gap takes the race's par out, so a
  // horse that ran to its place in our order reads as zero whatever the grade.
  const fancied = sane.filter((r) => r.relGap !== undefined && r.runner.ratings.runs >= 2 && (r.runner.rank || (r.sp && r.sp <= 5)));
  for (const r of [...fancied].filter((r) => r.relGap! <= -3).sort((a, b) => a.relGap! - b.relGap!).slice(0, 3)) {
    out.push({
      kind: "disappointing",
      runner: r,
      text: `${r.runner.horseName} was a disappointing runner at ${where(r)}: ${result(r)}${r.sp ? ` at ${money(r.sp)}` : ""}, ${Math.abs(r.relGap!).toFixed(1)} points below where we had it against the field.`,
    });
  }
  const improver = [...sane].filter((r) => r.relGap !== undefined && r.runner.ratings.runs >= 2 && !out.some((t) => t.runner === r)).sort((a, b) => b.relGap! - a.relGap!)[0];
  if (improver && improver.relGap! >= 3) {
    out.push({
      kind: "improver",
      runner: improver,
      text: `${improver.runner.horseName} improved the most on where we had it: ${improver.relGap!.toFixed(1)} points above its place in our order, ${result(improver)}${improver.sp ? ` at ${money(improver.sp)}` : ""} at ${where(improver)}.`,
    });
  }
  const onMark = fancied.filter((r) => Math.abs(r.relGap!) <= 2);
  if (fancied.length) {
    const pick = [...onMark].sort((a, b) => Math.abs(a.relGap!) - Math.abs(b.relGap!))[0];
    out.push({
      kind: "on the mark",
      runner: pick ?? fancied[0],
      text: `${onMark.length} of the ${fancied.length} fancied runners with full benchmarks ran within two points of their place in our order${pick ? `, ${pick.runner.horseName} at ${where(pick)} the closest at ${signedPoints(pick.relGap!)}` : ""}.`,
    });
  }
  return out;
}
const signedPoints = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(1)}`;

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
        grade: `Group ${m[1]}`,
        winner,
        topRated,
        placings,
        calls,
        units: settled.length ? round1(settled.reduce((a, r) => a + settle(r.runner.signal!, r.runner.marketPrice!, r.finish!), 0)) : undefined,
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
      const mine = (rows: LedgerRow[]) => rows.filter((b) => b.meeting.meetingId === meeting.meetingId && b.units !== undefined);
      const b = mine(bets), l = mine(lays);
      return {
        meeting,
        races: rs.length,
        runners: runners.length,
        full: fullRunners.length,
        bias: gaps.length ? round1(mean(gaps)) : undefined,
        spread: gaps.length ? round1(mean(gaps.map(Math.abs))) : undefined,
        relSpread: gaps.length ? round1(mean(fullRunners.map((r) => Math.abs(r.relGap ?? 0)))) : undefined,
        fit: pearson(fullRunners.map((r) => [r.runner.ratings.today, r.ranTo!] as [number, number])),
        resulted: resulted.length,
        winnersInFour: winners.filter((w) => w.runner.rank).length,
        topRatedWon: topRated.filter((t) => t.finish === 1).length,
        topRatedPlaced: topRated.filter((t) => t.finish && t.finish <= 3).length,
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
      const runners: ReviewedRunner[] = race.runners
        .filter((x) => !x.scratched)
        .map((runner) => {
          const key = `${race.raceId}:${runner.tabNumber}`;
          const run = byRunner.get(key)?.run;
          const placing = race.placings?.find((p) => p.tabNumber === runner.tabNumber);
          const ranTo = run?.vsClass !== undefined ? round1(par + run.vsClass * clockPoints(race.distance)) : undefined;
          const early = firstSection(run);
          const late = lastSection(run);
          return {
            runner,
            run: byRunner.has(key) ? run : undefined,
            ranTo,
            gap: ranTo !== undefined ? round1(ranTo - runner.ratings.today) : undefined,
            finish: run?.finish ?? runner.finishPosition,
            margin: run?.margin ?? placing?.margin,
            sp: placing?.sp,
            early: early?.vsClass,
            late: late?.vsClass,
            lateRank: late?.rank,
          };
        })
        .sort((a, b) => (a.finish || 99) - (b.finish || 99) || a.runner.tabNumber - b.runner.tabNumber);
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
      const anyFirst = runners.map((r) => firstSection(r.run)).find(Boolean);
      const leaderEarly = anyFirst ? round1(anyFirst.vsClass - anyFirst.vsLeader) : undefined;
      const tempo: Tempo | undefined = leaderEarly === undefined ? undefined : leaderEarly >= TEMPO_LENGTHS ? "fast" : leaderEarly <= -TEMPO_LENGTHS ? "slow" : "even";
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
        leaderEarly,
        tempo,
      };
      races.push(reviewed);
      for (const r of runners) {
        const x = r.runner;
        if (!x.signal || !x.marketPrice) continue;
        const row: LedgerRow = {
          ...r,
          meeting,
          race,
          side: x.signal,
          tag: tagOf.get(`${race.raceId}:${x.tabNumber}`),
          units: r.finish !== undefined ? settle(x.signal, x.marketPrice, r.finish) : undefined,
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
    worst: byVsClass.slice(-10).reverse(),
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
    },
  };
}
