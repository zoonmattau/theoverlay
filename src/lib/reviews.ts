import "server-only";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/billing/access";
import { postReview } from "@/lib/discord";
import { buildReview, type Review, type TalkingPoint } from "@/lib/model/review";
import { settle } from "@/lib/tips";

/**
 * The public Saturday review: a few storylines an admin publishes from the
 * weekly review. Everything here is on our scale, in points against our
 * marks and public form-guide facts; Form King's benchmark lengths stay on
 * the admin page.
 */

export interface Storyline {
  kind: TalkingPoint["kind"];
  horse: string;
  track: string;
  raceNumber: number;
  /** For the link to the race page. */
  meetingId: string;
  raceId: string;
  text: string;
}

/** A Group race for the public page: public facts plus where we had the placegetters. */
export interface FeatureLine {
  grade: string;
  track: string;
  raceNumber: number;
  name: string;
  distance: number;
  meetingId: string;
  raceId: string;
  /** Par for the grade on our scale. */
  par: number;
  /** The winner's run on our scale, when the clock is in. */
  winnerRanTo?: number;
  tempo?: string;
  winner?: string;
  winnerSp?: number;
  /** Our rank for the winner, or none. */
  winnerRank?: number;
  topRated?: string;
  topRatedFinish?: number;
  /** The first three home. */
  placings: { finish: number; horse: string; sp?: number; mark: number; rank?: number; ranTo?: number }[];
  /** Our top four, in our order. */
  ourFour: { rank: number; horse: string; mark: number; ratedPrice: number; marketPrice?: number; finish?: number; call?: "back" | "lay" }[];
  calls: { side: "back" | "lay"; horse: string; marketPrice: number; finish?: number; units?: number }[];
  units?: number;
  text: string;
}

export interface DayRecord {
  bets: number;
  betUnits: number;
  lays: number;
  layUnits: number;
  /** Meetings with most runners benchmarked, for the intro. */
  meetings: string[];
}

export interface PublishedReview {
  date: string;
  publishedAt: string;
  intro: string;
  storylines: Storyline[];
  features: FeatureLine[];
  record: DayRecord;
}

/** How long the home page carries the review after it goes live. */
export const REVIEW_BANNER_MS = 2 * 24 * 60 * 60_000;

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const money = (n?: number) => (n ? ` at $${n.toFixed(2)}` : "");
const pts = (n: number) => `${Math.abs(n).toFixed(1)} points`;

/** The talking points said for the public: points on our scale, never lengths against a benchmark. */
export function storylinesOf(review: Review): Storyline[] {
  const out: Storyline[] = [];
  for (const t of review.talking) {
    const r = t.runner;
    const where = `${r.race.meeting.track} R${r.race.race.raceNumber}`;
    const result = r.finish === 1 ? "won" : r.finish ? `ran ${ordinal(r.finish)}${r.margin !== undefined ? `, beaten ${r.margin.toFixed(1)} lengths` : ""}` : "ran";
    const mark = r.runner.ratings.today.toFixed(1);
    let text: string | undefined;
    if (t.kind === "run of the day") text = `${r.runner.horseName} put up the run of the day at ${where}: a run worth ${r.ranTo?.toFixed(1)} on our scale against the ${mark} we had it at, and ${result}${money(r.sp)}.`;
    else if (t.kind === "under the radar" && r.gap !== undefined) text = `${r.runner.horseName} slipped under the radar at ${where}: ${result}${money(r.sp)}, but the run was worth ${r.ranTo?.toFixed(1)}, ${pts(r.gap)} above our mark. One to follow.`;
    else if (t.kind === "disappointing" && r.relGap !== undefined) text = `${r.runner.horseName} was the disappointment at ${where}: ${result}${money(r.sp)}, ${pts(r.relGap)} below where we had it against the field.`;
    else if (t.kind === "improver" && r.relGap !== undefined) text = `${r.runner.horseName} improved the most on our numbers: ${pts(r.relGap)} above its place in our order at ${where}, and ${result}${money(r.sp)}.`;
    else if (t.kind === "on the mark") text = t.text;
    if (!text) continue;
    out.push({ kind: t.kind, horse: r.runner.horseName, track: r.race.meeting.track, raceNumber: r.race.race.raceNumber, meetingId: r.race.meeting.meetingId, raceId: r.race.race.raceId, text });
  }
  return out;
}

/** The Group races as one line each: who won, where we had it, and the line we take from it. */
export function featuresOf(review: Review): FeatureLine[] {
  return review.features.map((f) => {
    const w = f.winner;
    const t = f.topRated;
    const isTop = Boolean(w && t && t === w);
    const rankWord = !w ? "" : isTop ? `our top-rated runner${w.runner.rank ? ` and #${w.runner.rank} in our four` : ""}` : w.runner.rank ? `#${w.runner.rank} in our four` : "outside our four";
    const top = t && !isTop ? ` Our top-rated ${t.runner.horseName} ${t.finish === 1 ? "won" : t.finish ? `ran ${ordinal(t.finish)}` : "ran"}.` : "";
    const calls = f.calls.length ? ` ${f.calls.map((c) => `${c.runner.signal === "lay" ? "Laid" : "Backed"} ${c.runner.horseName}, ${c.finish === 1 ? "won" : c.finish ? `${ordinal(c.finish)}` : "to run"}`).join("; ")}.` : "";
    const par = f.race.race.classPoints;
    const ran = w?.ranTo !== undefined ? ` The winner's run was worth ${w.ranTo.toFixed(1)} on our scale against a par of ${par} for the grade${f.race.tempo ? `, run at a ${f.race.tempo} tempo` : ""}.` : "";
    return {
      grade: f.grade,
      track: f.race.meeting.track,
      raceNumber: f.race.race.raceNumber,
      name: f.race.race.name,
      distance: f.race.race.distance,
      meetingId: f.race.meeting.meetingId,
      raceId: f.race.race.raceId,
      par,
      winnerRanTo: w?.ranTo,
      tempo: f.race.tempo,
      winner: w?.runner.horseName,
      winnerSp: w?.sp,
      winnerRank: w?.runner.rank ?? undefined,
      topRated: t?.runner.horseName,
      topRatedFinish: t?.finish,
      placings: f.placings.map((p) => ({ finish: p.finish!, horse: p.runner.horseName, sp: p.sp, mark: p.runner.ratings.today, rank: p.runner.rank ?? undefined, ranTo: p.ranTo })),
      ourFour: f.race.runners
        .filter((x) => x.runner.rank)
        .sort((a, b) => a.runner.rank! - b.runner.rank!)
        .map((x) => ({ rank: x.runner.rank!, horse: x.runner.horseName, mark: x.runner.ratings.today, ratedPrice: x.runner.ratedPrice, marketPrice: x.runner.marketPrice, finish: x.finish, call: x.runner.signal })),
      calls: f.calls.map((c) => ({ side: c.runner.signal!, horse: c.runner.horseName, marketPrice: c.runner.marketPrice!, finish: c.finish, units: c.finish !== undefined ? settle(c.runner.signal!, c.runner.marketPrice!, c.finish) : undefined })),
      units: f.units,
      text: w ? `${w.runner.horseName} won${money(w.sp)}, ${rankWord}.${top}${ran}${calls}` : "Not run yet.",
    };
  });
}

export function recordOf(review: Review): DayRecord {
  const settled = (rows: Review["bets"]) => rows.filter((r) => r.units !== undefined);
  const sum = (rows: Review["bets"]) => Math.round(settled(rows).reduce((a, r) => a + (r.units ?? 0), 0) * 100) / 100;
  return {
    bets: settled(review.bets).length,
    betUnits: sum(review.bets),
    lays: settled(review.lays).length,
    layUnits: sum(review.lays),
    meetings: review.meetings.filter((m) => m.runners && m.full / m.runners >= 0.8).map((m) => m.meeting.track),
  };
}

function introOf(date: string, record: DayRecord): string {
  const day = new Date(`${date}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
  const where = record.meetings.length ? ` The clock is in for ${record.meetings.slice(0, -1).join(", ")}${record.meetings.length > 1 ? " and " : ""}${record.meetings.at(-1)}.` : "";
  const units = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}`;
  return `${day}, every runner's run against the mark we had it at.${where} The model's calls: ${record.bets} bets for ${units(record.betUnits)} units and ${record.lays} lays for ${units(record.layUnits)}, level stakes.`;
}

/** The review as it would be published now, for the admin preview: nothing stored, nothing posted. */
export function previewReview(review: Review): PublishedReview {
  const record = recordOf(review);
  return { date: review.date, publishedAt: "", intro: introOf(review.date, record), storylines: storylinesOf(review), features: featuresOf(review), record };
}

/** Builds, stores and announces the review for a date. Publishing again replaces the storylines and posts nothing new. */
export async function publishReview(date: string): Promise<PublishedReview> {
  const review = await buildReview(date);
  if (!review) throw new Error(`No card for ${date}.`);
  const storylines = storylinesOf(review);
  const features = featuresOf(review);
  const record = recordOf(review);
  const intro = introOf(date, record);
  const { data: existing } = await supabaseAdmin().from("reviews").select("published_at").eq("date", date).maybeSingle();
  const publishedAt = (existing?.published_at as string | undefined) ?? new Date().toISOString();
  const { error } = await supabaseAdmin().from("reviews").upsert({ date, published_at: publishedAt, intro, storylines, features, record });
  if (error) throw new Error(error.message);
  const published: PublishedReview = { date, publishedAt, intro, storylines, features, record };
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath(`/review/${date}`);
  if (!existing) await postReview(published);
  return published;
}

function fromRow(r: { date: string; published_at: string; intro: string; storylines: unknown; features?: unknown; record: unknown }): PublishedReview {
  return {
    date: r.date,
    publishedAt: r.published_at,
    intro: r.intro,
    storylines: (r.storylines as Storyline[]) ?? [],
    features: (r.features as FeatureLine[]) ?? [],
    record: (r.record as DayRecord) ?? { bets: 0, betUnits: 0, lays: 0, layUnits: 0, meetings: [] },
  };
}

export async function readPublishedReview(date: string): Promise<PublishedReview | undefined> {
  const { data } = await supabaseAdmin().from("reviews").select("*").eq("date", date).maybeSingle();
  return data ? fromRow(data) : undefined;
}

export async function latestPublishedReview(): Promise<PublishedReview | undefined> {
  const { data } = await supabaseAdmin().from("reviews").select("*").order("published_at", { ascending: false }).limit(1).maybeSingle();
  return data ? fromRow(data) : undefined;
}

/** The review the home page should carry: the latest, while it is under two days old. */
export async function bannerReview(): Promise<PublishedReview | undefined> {
  const latest = await latestPublishedReview();
  return latest && Date.now() - new Date(latest.publishedAt).getTime() < REVIEW_BANNER_MS ? latest : undefined;
}
