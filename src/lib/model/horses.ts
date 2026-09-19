import "server-only";

import type { MeetingSummary, RaceEntry, RaceSummary } from "@/lib/formking/types";
import { supabaseAdmin } from "@/lib/billing/access";
import { rememberRuns, runRowsOf, type RunRow } from "./runs";
import { classPoints, goingBand, isJumps, rateEntries, runPoints } from "./ratings";
import { publishRace } from "./publish";
import type { GoingBand, PublishedRace, RunnerRatings } from "./types";

/** A horse as the store holds it: the entry we rated it on, and where it was last seen. */
/** The category ratings kept on the row: everything but the day-specific parts. */
export type HorseRatings = Pick<RunnerRatings, "class" | "early" | "mid" | "late" | "pressure" | "tempo" | "going" | "runs">;

export interface StoredHorse {
  id: string;
  name: string;
  entry: RaceEntry;
  ratings: HorseRatings | null;
  class: number | null;
  age: number | null;
  state: string | null;
  last_track: string | null;
  last_seen: string;
  /** The best single run we scored it, its last three runs against the three before, and the runs behind both. */
  peak: number | null;
  trend: number | null;
  starts: number | null;
}

/** The entry without the market, Form King's own ratings, the result or the day's connections' form. */
function trim(e: RaceEntry): RaceEntry {
  const { odds: _odds, ratings: _ratings, horseResult: _result, jockeyForm: _jf, trainerForm: _tf, ...rest } = e as RaceEntry & { odds?: unknown; ratings?: unknown; horseResult?: unknown; jockeyForm?: unknown; trainerForm?: unknown };
  void _odds; void _ratings; void _result; void _jf; void _tf;
  return rest as RaceEntry;
}

/**
 * Remember every runner on a race we have rated, newest form wins. Called
 * from the card build with the raw Form King races, so the store grows by
 * itself; the id is Form King's breeding id.
 */
export async function rememberHorses(meeting: MeetingSummary, races: RaceSummary[]): Promise<void> {
  const date = (meeting.date ? new Date(meeting.date) : new Date()).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const rows: StoredHorse[] = [];
  const runs: RunRow[] = [];
  for (const race of races) {
    const points = classPoints(race.restrictions, race.name);
    let rated: ReturnType<typeof rateEntries>["rated"] = [];
    try {
      rated = rateEntries(race.entries, { classPoints: points, going: goingBand(race.going), distance: race.distance, track: race.trackName ?? meeting.trackName }).rated;
    } catch {
      // A race we cannot rate still teaches us the horses' form.
    }
    const byTab = new Map(rated.map((r) => [r.key, r.ratings]));
    for (const e of race.entries) {
      const id = (e as RaceEntry & { breedingId?: string }).breedingId;
      if (!id || !e.horse?.name) continue;
      const g = byTab.get(String(e.number));
      runs.push(...runRowsOf(e, id));
      const form = formShape(e, points, Date.parse(String(race.date ?? meeting.date ?? date)) || undefined);
      rows.push({
        id,
        name: e.horse.name,
        entry: trim(e),
        ratings: g && g.runs > 0 ? { class: g.class, early: g.early, mid: g.mid, late: g.late, pressure: g.pressure, tempo: g.tempo, going: g.going, runs: g.runs } : null,
        class: g && g.runs > 0 ? g.class : null,
        peak: form.peak,
        trend: form.trend,
        starts: form.starts,
        age: e.horse.age ?? null,
        state: meeting.state ?? null,
        last_track: race.trackName ?? meeting.trackName ?? null,
        last_seen: date,
      });
    }
  }
  if (rows.length === 0) return;
  // Every past run on the form, for the Datahub.
  await rememberRuns(runs);
  // One row per horse. A horse entered twice at the meeting put its id in the
  // batch twice, and Postgres rejects the whole statement rather than the
  // duplicate ("ON CONFLICT DO UPDATE command cannot affect row a second
  // time"), so two hundred horses were lost for the sake of one. The reading
  // with a rating behind it wins.
  const byId = new Map<string, StoredHorse>();
  for (const r of rows) {
    const had = byId.get(r.id);
    if (!had || (had.class === null && r.class !== null)) byId.set(r.id, r);
  }
  // The newest sighting wins; an older card must not overwrite a newer one.
  const unique = [...byId.values()];
  const { data: existing } = await supabaseAdmin().from("horses").select("id, last_seen").in("id", unique.map((r) => r.id));
  const seen = new Map((existing ?? []).map((r) => [r.id as string, String(r.last_seen)]));
  const fresh = unique.filter((r) => !seen.has(r.id) || seen.get(r.id)! <= r.last_seen);
  // Fifty at a time: each row carries the horse's whole entry, and two hundred
  // of them was enough to time the statement out on a small instance.
  for (let i = 0; i < fresh.length; i += 50) {
    const { error } = await supabaseAdmin().from("horses").upsert(fresh.slice(i, i + 50).map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "id" });
    if (error) console.error("[horses]", error.message);
  }
}

/**
 * A horse's shape from its own runs, scored the way the race page scores
 * them: the best it has run, and its last three against the three before.
 * The trend needs two on each side to say anything, so a lightly raced
 * horse has none rather than a number made of one run.
 */
function formShape(e: RaceEntry, classPoints: number, asOf?: number): { peak: number | null; trend: number | null; starts: number | null } {
  const past = (e.pastEvents ?? []).filter((p) => p.race !== false && !p.trial && !p.spell && !p.scratched && p.date && !isJumps(p));
  const pts = past.map((p) => runPoints(p, classPoints, e.horse?.age, asOf)).filter((v) => Number.isFinite(v));
  if (pts.length === 0) return { peak: null, trend: null, starts: null };
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const recent = pts.slice(0, 3);
  const before = pts.slice(3, 6);
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    peak: round(Math.max(...pts)),
    trend: recent.length >= 2 && before.length >= 2 ? round(mean(recent) - mean(before)) : null,
    starts: pts.length,
  };
}

/** What a page may see of a horse: never the entry, which is licensed form. */
export interface HorseSummary {
  id: string;
  name: string;
  class: number | null;
  ratings: HorseRatings | null;
  age: number | null;
  state: string | null;
  lastTrack: string | null;
  lastSeen: string;
  /** The best single run we have scored it: our clock against the race's class, not the handicapper's mark. */
  peak: number | null;
  /** Its last three runs against the three before, in points: on the up or on the way down. */
  trend: number | null;
  /** Runs the peak and the trend are built on. */
  starts: number | null;
}
const SUMMARY_BARE = "id, name, class, ratings, age, state, last_track, last_seen";
const SUMMARY = `${SUMMARY_BARE}, peak, trend, starts`;
const summary = (r: Record<string, unknown>): HorseSummary => ({
  id: String(r.id), name: String(r.name), class: r.class === null ? null : Number(r.class), ratings: (r.ratings as HorseRatings | null) ?? null,
  age: r.age === null ? null : Number(r.age), state: (r.state as string | null) ?? null, lastTrack: (r.last_track as string | null) ?? null, lastSeen: String(r.last_seen),
  peak: r.peak === null || r.peak === undefined ? null : Number(r.peak),
  trend: r.trend === null || r.trend === undefined ? null : Number(r.trend),
  starts: r.starts === null || r.starts === undefined ? null : Number(r.starts),
});

/** Horses whose name contains the query, best rated first. */
export async function searchHorses(q: string, limit = 12): Promise<HorseSummary[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const { data } = await supabaseAdmin().from("horses").select(SUMMARY).ilike("name", `%${needle}%`).order("class", { ascending: false, nullsFirst: false }).limit(limit);
  return (data ?? []).map((r) => summary(r as Record<string, unknown>));
}

/** Server-side only: the full stored rows, for pricing. Never hand these to a page. */
async function getHorses(ids: string[]): Promise<StoredHorse[]> {
  if (ids.length === 0) return [];
  const { data } = await supabaseAdmin().from("horses").select("*").in("id", ids);
  const byId = new Map(((data ?? []) as StoredHorse[]).map((h) => [h.id, h]));
  return ids.map((id) => byId.get(id)).filter((h): h is StoredHorse => Boolean(h));
}

/** The power rankings: the best-rated horses we hold, enough for the page to sort and filter on its own. */
/** The cuts the rankings page offers: where it races, how old, how lately seen. */
export interface HorseFilter {
  state?: string;
  minAge?: number;
  maxAge?: number;
  /** Only horses seen on a card in the last this many days. */
  sinceDays?: number;
}

export async function rankHorses(limit = 1000, filter: HorseFilter = {}): Promise<{ rows: HorseSummary[]; total: number }> {
  let q = supabaseAdmin().from("horses").select(SUMMARY, { count: "exact" }).not("class", "is", null);
  if (filter.state) q = q.eq("state", filter.state);
  if (filter.minAge !== undefined) q = q.gte("age", filter.minAge);
  if (filter.maxAge !== undefined) q = q.lte("age", filter.maxAge);
  if (filter.sinceDays !== undefined) {
    const since = new Date(Date.now() - filter.sinceDays * 86400_000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    q = q.gte("last_seen", since);
  }
  const { data, count, error } = await q.order("class", { ascending: false }).order("name").limit(limit);
  // Before the form columns exist the select is rejected whole, which would
  // empty the rankings; the ladder reads the same without them.
  if (error) {
    console.error("[horses]", error.message);
    const bare = await supabaseAdmin().from("horses").select(SUMMARY_BARE, { count: "exact" }).not("class", "is", null).order("class", { ascending: false }).order("name").limit(limit);
    return { rows: (bare.data ?? []).map((r) => summary(r as Record<string, unknown>)), total: bare.count ?? 0 };
  }
  return { rows: (data ?? []).map((r) => summary(r as Record<string, unknown>)), total: count ?? 0 };
}

export interface FantasyRace {
  distance: number;
  going: GoingBand;
  /** Par in benchmark points, e.g. 72 for a Bm72. */
  classPoints: number;
  track?: string;
  name?: string;
}

/**
 * A race that has not been run: the chosen horses over the chosen trip on
 * the chosen ground, priced by the same code as a real race. There is no
 * market, so the prices are the form's alone.
 */
export async function priceFantasy(ids: string[], race: FantasyRace): Promise<PublishedRace | undefined> {
  const horses = await getHorses(ids);
  if (horses.length < 2) return undefined;
  const entries: RaceEntry[] = horses.map((h, i) => ({
    ...h.entry,
    number: i + 1,
    barrier: i + 1,
    scratched: false,
    // The horse carries what it carried last time.
    weight: h.entry.weightCarried ?? h.entry.weight,
  }));
  const summary: RaceSummary = {
    raceId: `fantasy-${horses.map((h) => h.id).join("-").slice(0, 60)}`,
    meetingId: "fantasy",
    number: 1,
    name: race.name ?? `${race.distance}m fantasy`,
    distance: race.distance,
    going: race.going === "good" ? "Good 4" : race.going === "soft" ? "Soft 5" : "Heavy 8",
    goingNumber: race.going === "good" ? 4 : race.going === "soft" ? 5 : 8,
    restrictions: `${race.classPoints}B`,
    trackName: race.track,
    entries,
  } as unknown as RaceSummary;
  const meeting: MeetingSummary = { id: "fantasy", trackName: race.track ?? "Fantasy", state: "", date: Date.now(), status: "", tabMeeting: true, updated: Date.now() };
  return publishRace(summary, meeting);
}
