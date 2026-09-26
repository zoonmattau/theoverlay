import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import { racingToday } from "@/lib/model/source";
import { readPublishedReview } from "@/lib/reviews";
import { reviewedDates } from "@/lib/model/review";

/** The small facts the admin overview shows beside each banner, each with a page behind it. */
export interface TodayFacts {
  date: string;
  /** Today's ledger so far, voids left out. `open` is raceId:tab for each call still to run. */
  bets: { calls: number; settled: number; won: number; units: number; open: string[] };
  lays: { calls: number; settled: number; held: number; units: number; open: string[] };
  /** Page views and people since midnight Sydney. */
  views: number;
  people: number;
  /** Tipsters' calls posted today, and follows in total. */
  tipsterCalls: number;
  follows: number;
  /** The most recent Saturday with a card: what the review holds and whether it is published. */
  review?: { date: string; runs: number; published: boolean };
}

const sydneyMidnight = () => {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  return new Date(`${day}T00:00:00+10:00`).toISOString();
};

/** The last Saturday on or before today, yyyy-mm-dd. */
function lastSaturday(today: string): string {
  const d = new Date(`${today}T12:00:00+10:00`);
  const back = (d.getDay() + 1) % 7;
  d.setDate(d.getDate() - back);
  return d.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

export async function todayFacts(): Promise<TodayFacts> {
  const db = supabaseAdmin();
  const date = racingToday();
  const since = sydneyMidnight();
  const sat = lastSaturday(date);
  const [{ data: tips }, { data: views }, { count: tipsterCalls }, { count: follows }, reviewed, published] = await Promise.all([
    db.from("tips").select("race_id, tab_number, side, units, finish_position, settled_at").eq("date", date).eq("source", "model"),
    db.from("events").select("user_id, meta").eq("kind", "page_view").gte("created_at", since).limit(20000),
    db.from("creator_tips").select("id", { count: "exact", head: true }).eq("date", date),
    db.from("follows").select("user_id", { count: "exact", head: true }),
    reviewedDates(),
    readPublishedReview(sat),
  ]);
  const rows = (tips ?? []) as { race_id: string; tab_number: number; side: "back" | "lay"; units: number | null; finish_position: number | null; settled_at: string | null }[];
  const side = (s: "back" | "lay") => {
    // A void (scratched after the call) is settled with no placing, and is no call at all.
    const mine = rows.filter((r) => r.side === s && !(r.settled_at && r.finish_position === null));
    const settled = mine.filter((r) => r.settled_at);
    return {
      calls: mine.length,
      open: mine.filter((r) => !r.settled_at).map((r) => `${r.race_id}:${r.tab_number}`),
      settled: settled.length,
      won: settled.filter((r) => (s === "back" ? r.finish_position === 1 : r.finish_position !== 1)).length,
      units: Math.round(settled.reduce((a, r) => a + Number(r.units ?? 0), 0) * 100) / 100,
    };
  };
  const b = side("back"), l = side("lay");
  const who = new Set((views ?? []).map((v) => v.user_id ?? `v:${(v.meta as { vid?: string } | null)?.vid ?? "?"}`));
  return {
    date,
    bets: { calls: b.calls, settled: b.settled, won: b.won, units: b.units, open: b.open },
    lays: { calls: l.calls, settled: l.settled, held: l.won, units: l.units, open: l.open },
    views: views?.length ?? 0,
    people: who.size,
    tipsterCalls: tipsterCalls ?? 0,
    follows: follows ?? 0,
    review: reviewed.has(sat) || published ? { date: sat, runs: reviewed.get(sat) ?? 0, published: Boolean(published) } : { date: sat, runs: 0, published: false },
  };
}
