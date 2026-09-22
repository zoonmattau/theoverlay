"use client";

import Link from "next/link";

import { DataTable, type Column } from "./DataTable";
import type { Breakdown, Combo, Distance, Going, Person, PersonRun, Track, TrackDistance, TrackShape, TrackTempo } from "@/lib/data/hub";
import type { Upcoming, UpcomingRace } from "@/lib/data/upcoming";

const trackHref = (track: string) => `/data/tracks/${encodeURIComponent(track)}`;
const distanceHref = (d: number) => `/data/distances/${d}`;

const day = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const clock = (s: number | null) => (s === null ? "—" : s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}` : s.toFixed(2));
const signed = (v: number | null, unit = "") => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}${unit}`);
const tone = (v: number | null) => (v === null ? "" : v > 0 ? "text-accent" : v < 0 ? "text-red" : "");

/** Jockeys or trainers, ranked on how they go against the market. */
export function PeopleTable({ rows, find, what, filtered, compact }: { rows: Person[]; find?: string; what: "rider" | "stable"; filtered?: boolean; /** Fewer columns, for a track or distance page. */ compact?: boolean }) {
  const base = what === "rider" ? "/data/jockeys" : "/data/trainers";
  const all: Column<Person>[] = [
    { key: "name", label: what === "rider" ? "Jockey" : "Trainer", tip: "Click a name for the profile, a heading to sort.", value: (r) => r.name, strong: true, asc: true, render: (r) => <Link href={`${base}/${encodeURIComponent(r.key)}`} className="underline decoration-dotted underline-offset-2">{r.name}</Link> },
    { key: "power", label: "Power", tip: "Winners over what the market expected, per hundred rides, pulled toward nought on a short record. The ranking.", right: true, value: (r) => r.power, render: (r) => <span className={`font-semibold ${tone(r.power)}`}>{signed(r.power)}</span> },
    { key: "rides", label: what === "rider" ? "Rides" : "Runners", tip: "Runs on the form we hold.", right: true, value: (r) => r.rides },
    { key: "wins", label: "Wins", tip: "Winners.", right: true, value: (r) => r.wins },
    { key: "winPct", label: "Win %", tip: "Winners per hundred rides.", right: true, value: (r) => r.winPct },
    { key: "placePct", label: "Place %", tip: "First three per hundred rides.", right: true, value: (r) => r.placePct },
    { key: "expected", label: "Market said", tip: "Winners the market expected from the rides that carried a price: Betfair's starting price where we have it, else the bookmakers' with a margin taken out.", right: true, value: (r) => r.expected, render: (r) => `${r.expected.toFixed(1)} of ${r.priced}` },
    { key: "edge", label: "+/−", tip: "Winners on priced rides over or under the market's expectation.", right: true, value: (r) => Math.round((r.winsPriced - r.expected) * 10) / 10, render: (r) => <span className={tone(r.winsPriced - r.expected)}>{signed(Math.round((r.winsPriced - r.expected) * 10) / 10)}</span> },
    { key: "winSp", label: "Win SP", tip: "Average starting price of the winners.", right: true, value: (r) => r.winSp, render: (r) => (r.winSp === null ? "—" : `$${r.winSp.toFixed(2)}`) },
    { key: "rides30", label: "30 days", tip: "Rides and wins in the last thirty days.", right: true, value: (r) => r.rides30, render: (r) => `${r.rides30} / ${r.wins30}` },
    { key: "lastRide", label: "Last", tip: "Most recent run on the form we hold.", value: (r) => r.lastRide, render: (r) => day(r.lastRide) },
  ];
  const cols = compact ? all.filter((c) => ["name", "power", "rides", "wins", "winPct", "edge"].includes(c.key)) : all;
  return (
    <DataTable rows={rows} columns={cols} rowKey={(r) => r.name} find={find} searchKeys={["name"]} defaultSort="power" noun={what === "rider" ? "jockeys" : "trainers"}
      minRows={{ key: "rides", min: filtered ? 10 : 30, label: `Show records under ${filtered ? 10 : 30} rides` }}
      note={compact ? undefined : "Built from every past run on the form of every horse we have rated, so a jockey's record here is their rides on those horses, not their whole book. Power is winners over the market's expectation per hundred rides, shrunk toward nought until the record is long enough to trust."} />
  );
}

/** Tracks, with how quick each runs against the rest. */
export function TracksTable({ rows, find }: { rows: Track[]; find?: string }) {
  const cols: Column<Track>[] = [
    { key: "track", label: "Track", tip: "Click a track for its page, a heading to sort.", value: (r) => r.track, strong: true, asc: true, render: (r) => <Link href={trackHref(r.track)} className="underline decoration-dotted underline-offset-2">{r.track}</Link> },
    { key: "state", label: "State", tip: "", value: (r) => r.state, asc: true },
    { key: "speed", label: "Speed", tip: "Lengths quicker (+) or slower (−) than the typical time over the same distances at every other track, weighted by runs.", right: true, value: (r) => r.speed, render: (r) => <span className={`font-semibold ${tone(r.speed)}`}>{signed(r.speed, "L")}</span> },
    { key: "vsBench", label: "Benchmark", tip: "How the feed's class benchmark reads runs here on average, in lengths: a track that runs under class every week is a slow one or a harshly benchmarked one.", right: true, value: (r) => r.vsBench, render: (r) => signed(r.vsBench, "L") },
    { key: "distances", label: "Distances", tip: "Distances we hold timed runs over.", right: true, value: (r) => r.distances },
    { key: "races", label: "Races", tip: "Races we hold a time from.", right: true, value: (r) => r.races },
    { key: "runs", label: "Runs", tip: "Timed runs.", right: true, value: (r) => r.runs },
    { key: "lastRun", label: "Last", tip: "Most recent run we hold.", value: (r) => r.lastRun, render: (r) => day(r.lastRun) },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => r.track} find={find} searchKeys={["track", "state"]} defaultSort="runs" noun="tracks" note="A length is a sixth of a second. Speed compares each distance's typical time here with the same distance everywhere else, so a track with one odd distance is not judged on it." />;
}

/** One track's distances and standard times. */
export function TrackDistancesTable({ rows, track }: { rows: TrackDistance[]; track: string }) {
  const cols: Column<TrackDistance>[] = [
    { key: "distance", label: "Distance", tip: "Click a distance for its page.", value: (r) => r.distance, strong: true, asc: true, render: (r) => <Link href={distanceHref(r.distance)} className="underline decoration-dotted underline-offset-2">{r.distance}m</Link> },
    { key: "median", label: "Standard", tip: "The typical time here, the middle of every timed run.", right: true, value: (r) => r.median, asc: true, render: (r) => <span className="font-semibold">{clock(r.median)}</span> },
    { key: "best", label: "Quickest", tip: "The quickest time we hold.", right: true, value: (r) => r.best, asc: true, render: (r) => clock(r.best) },
    { key: "good", label: "Good", tip: "Typical time on good ground.", right: true, value: (r) => r.good, asc: true, render: (r) => clock(r.good) },
    { key: "soft", label: "Soft", tip: "Typical time on soft ground.", right: true, value: (r) => r.soft, asc: true, render: (r) => clock(r.soft) },
    { key: "heavy", label: "Heavy", tip: "Typical time on heavy ground.", right: true, value: (r) => r.heavy, asc: true, render: (r) => clock(r.heavy) },
    { key: "speed", label: "Speed", tip: "Lengths quicker (+) or slower (−) than this distance everywhere else.", right: true, value: (r) => r.speed, render: (r) => <span className={tone(r.speed)}>{signed(r.speed, "L")}</span> },
    { key: "vsBench", label: "Benchmark", tip: "How the feed's benchmark reads runs over this trip here, in lengths.", right: true, value: (r) => r.vsBench, render: (r) => signed(r.vsBench, "L") },
    { key: "runs", label: "Runs", tip: "Timed runs.", right: true, value: (r) => r.runs },
    { key: "lastRun", label: "Last", tip: "", value: (r) => r.lastRun, render: (r) => day(r.lastRun) },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => String(r.distance)} searchKeys={["distance"]} defaultSort="distance" noun={`distances at ${track}`} />;
}

/** Every distance: the typical time, the quickest track, the record. */
export function DistancesTable({ rows, find }: { rows: Distance[]; find?: string }) {
  const cols: Column<Distance>[] = [
    { key: "distance", label: "Distance", tip: "Click a distance for its page.", value: (r) => r.distance, strong: true, asc: true, render: (r) => <Link href={distanceHref(r.distance)} className="underline decoration-dotted underline-offset-2">{r.distance}m</Link> },
    { key: "typical", label: "Typical", tip: "The typical time over this distance across every track, weighted by runs.", right: true, value: (r) => r.typical, asc: true, render: (r) => <span className="font-semibold">{clock(r.typical)}</span> },
    { key: "quickest", label: "Quickest track", tip: "The track with the quickest typical time, among tracks with twenty runs or more.", value: (r) => r.quickest, asc: true, render: (r) => <Link href={trackHref(r.quickest)} className="underline decoration-dotted underline-offset-2">{r.quickest}</Link> },
    { key: "quickestMedian", label: "Its time", tip: "", right: true, value: (r) => r.quickestMedian, asc: true, render: (r) => clock(r.quickestMedian) },
    { key: "record", label: "Record", tip: "The quickest time we hold over this distance anywhere.", right: true, value: (r) => r.record, asc: true, render: (r) => clock(r.record) },
    { key: "recordTrack", label: "Where", tip: "", value: (r) => r.recordTrack, asc: true },
    { key: "tracks", label: "Tracks", tip: "Tracks we hold this distance at.", right: true, value: (r) => r.tracks },
    { key: "runs", label: "Runs", tip: "Timed runs.", right: true, value: (r) => r.runs },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => String(r.distance)} find={find} searchKeys={["distance", "quickest"]} defaultSort="distance" noun="distances" />;
}

/** One distance across the tracks that run it. */
export function DistanceTracksTable({ rows, distance }: { rows: TrackDistance[]; distance: number }) {
  const cols: Column<TrackDistance>[] = [
    { key: "track", label: "Track", tip: "Click a track for its page.", value: (r) => r.track, strong: true, asc: true, render: (r) => <Link href={trackHref(r.track)} className="underline decoration-dotted underline-offset-2">{r.track}</Link> },
    { key: "state", label: "State", tip: "", value: (r) => r.state, asc: true },
    { key: "median", label: "Standard", tip: "The typical time here.", right: true, value: (r) => r.median, asc: true, render: (r) => <span className="font-semibold">{clock(r.median)}</span> },
    { key: "speed", label: "Speed", tip: "Lengths quicker (+) or slower (−) than this distance everywhere else.", right: true, value: (r) => r.speed, render: (r) => <span className={tone(r.speed)}>{signed(r.speed, "L")}</span> },
    { key: "best", label: "Quickest", tip: "", right: true, value: (r) => r.best, asc: true, render: (r) => clock(r.best) },
    { key: "good", label: "Good", tip: "", right: true, value: (r) => r.good, asc: true, render: (r) => clock(r.good) },
    { key: "soft", label: "Soft", tip: "", right: true, value: (r) => r.soft, asc: true, render: (r) => clock(r.soft) },
    { key: "heavy", label: "Heavy", tip: "", right: true, value: (r) => r.heavy, asc: true, render: (r) => clock(r.heavy) },
    { key: "runs", label: "Runs", tip: "", right: true, value: (r) => r.runs },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => r.track} searchKeys={["track", "state"]} defaultSort="median" noun={`tracks over ${distance}m`} />;
}

/** What soft and heavy ground cost against good, track by track. */
export function GoingsTable({ rows, find }: { rows: Going[]; find?: string }) {
  const cols: Column<Going>[] = [
    { key: "track", label: "Track", tip: "Click a track for its page.", value: (r) => r.track, strong: true, asc: true, render: (r) => <Link href={trackHref(r.track)} className="underline decoration-dotted underline-offset-2">{r.track}</Link> },
    { key: "distance", label: "Distance", tip: "Click a distance for its page.", value: (r) => r.distance, asc: true, render: (r) => <Link href={distanceHref(r.distance)} className="underline decoration-dotted underline-offset-2">{r.distance}m</Link> },
    { key: "good", label: "Good", tip: "Typical time on good ground.", right: true, value: (r) => r.good, asc: true, render: (r) => clock(r.good) },
    { key: "soft", label: "Soft", tip: "Typical time on soft ground.", right: true, value: (r) => r.soft, asc: true, render: (r) => clock(r.soft) },
    { key: "softLengths", label: "Soft costs", tip: "Lengths slower than good on soft ground.", right: true, value: (r) => r.softLengths, render: (r) => (r.softLengths === null ? "—" : `${r.softLengths.toFixed(1)}L`) },
    { key: "heavy", label: "Heavy", tip: "Typical time on heavy ground.", right: true, value: (r) => r.heavy, asc: true, render: (r) => clock(r.heavy) },
    { key: "heavyLengths", label: "Heavy costs", tip: "Lengths slower than good on heavy ground.", right: true, value: (r) => r.heavyLengths, render: (r) => (r.heavyLengths === null ? "—" : `${r.heavyLengths.toFixed(1)}L`) },
    { key: "runs", label: "Runs", tip: "Timed runs over this trip here, all goings.", right: true, value: (r) => r.runs },
    { key: "who", label: "Who handles it", tip: "The jockeys ranked on soft or heavy ground at this track.", value: () => null, render: (r) => <span className="text-xs"><Link href={`/data/jockeys?track=${encodeURIComponent(r.track)}&going=5,6,7`} className="underline decoration-dotted underline-offset-2">soft</Link> · <Link href={`/data/jockeys?track=${encodeURIComponent(r.track)}&going=8,9,10`} className="underline decoration-dotted underline-offset-2">heavy</Link></span> },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => `${r.track} ${r.distance}`} find={find} searchKeys={["track", "distance"]} defaultSort="runs" noun="track and distance pairs" note="Only pairs with a good-ground time and twenty runs or more. A negative cost means the soft or heavy runs we hold were the quicker ones, which with few runs is the sample, not the ground." />;
}

const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

/** Jockey and trainer pairs. */
export function CombosTable({ rows, find }: { rows: Combo[]; find?: string }) {
  const cols: Column<Combo>[] = [
    { key: "jockey", label: "Jockey", tip: "", value: (r) => r.jockey, strong: true, asc: true, render: (r) => <Link href={`/data/jockeys/${encodeURIComponent(r.jockeyKey)}`} className="underline decoration-dotted underline-offset-2">{r.jockey}</Link> },
    { key: "trainer", label: "Trainer", tip: "", value: (r) => r.trainer, strong: true, asc: true, render: (r) => <Link href={`/data/trainers/${encodeURIComponent(r.trainerKey)}`} className="underline decoration-dotted underline-offset-2">{r.trainer}</Link> },
    { key: "power", label: "Power", tip: "Winners over what the market expected, per hundred runs together, shrunk toward nought on a short record.", right: true, value: (r) => r.power, render: (r) => <span className={`font-semibold ${tone(r.power)}`}>{signed(r.power)}</span> },
    { key: "rides", label: "Together", tip: "Runs as a pair.", right: true, value: (r) => r.rides },
    { key: "wins", label: "Wins", tip: "", right: true, value: (r) => r.wins },
    { key: "winPct", label: "Win %", tip: "", right: true, value: (r) => r.winPct },
    { key: "expected", label: "Market said", tip: "Winners the market expected from the runs that carried a price.", right: true, value: (r) => r.expected, render: (r) => `${r.expected.toFixed(1)} of ${r.priced}` },
    { key: "edge", label: "+/−", tip: "Winners on priced runs over or under the market's expectation.", right: true, value: (r) => Math.round((r.winsPriced - r.expected) * 10) / 10, render: (r) => <span className={tone(r.winsPriced - r.expected)}>{signed(Math.round((r.winsPriced - r.expected) * 10) / 10)}</span> },
    { key: "lastRide", label: "Last", tip: "", value: (r) => r.lastRide, render: (r) => day(r.lastRide) },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => `${r.jockey} / ${r.trainer}`} find={find} searchKeys={["jockey", "trainer"]} defaultSort="power" noun="pairs" minRows={{ key: "rides", min: 20, label: "Show pairs under 20 runs" }} />;
}

/** A person's record cut one way: by track, trip, going, year, partner or horse. */
/** A row's link is set by the server page: a function cannot cross into a client table. */
export type LinkedBreakdown = Breakdown & { href?: string };

export function BreakdownTable({ rows, label, noun, keepOrder, hint }: { rows: LinkedBreakdown[]; label: string; noun: string; /** Rows come in an order worth keeping, like price bands. */ keepOrder?: boolean; hint?: string }) {
  const cols: Column<LinkedBreakdown>[] = [
    { key: "label", label, tip: "", value: (r) => r.label, strong: true, asc: true, render: (r) => (r.href ? <Link href={r.href} className="underline decoration-dotted underline-offset-2">{r.label}</Link> : r.label) },
    { key: "rides", label: "Runs", tip: "", right: true, value: (r) => r.rides },
    { key: "wins", label: "Wins", tip: "", right: true, value: (r) => r.wins },
    { key: "winPct", label: "Win %", tip: "", right: true, value: (r) => r.winPct },
    { key: "edge", label: "v market", tip: "Winners over or under what the market expected.", right: true, value: (r) => Math.round((r.wins - r.expected) * 10) / 10, render: (r) => <span className={tone(r.wins - r.expected)}>{signed(Math.round((r.wins - r.expected) * 10) / 10)}</span> },
    { key: "power", label: "Power", tip: "", right: true, value: (r) => r.power, render: (r) => <span className={tone(r.power)}>{signed(r.power)}</span> },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => r.label} searchKeys={["label"]} defaultSort={keepOrder ? "" : "rides"} noun={noun} note={hint} />;
}

/** A person's last runs. */
export function PersonRunsTable({ rows, other }: { rows: PersonRun[]; other: "jockey" | "trainer" }) {
  const cols: Column<PersonRun>[] = [
    { key: "date", label: "Date", tip: "", value: (r) => r.date, render: (r) => day(r.date) },
    { key: "track", label: "Track", tip: "Click for the track's page.", value: (r) => r.track, asc: true, render: (r) => (r.track ? <><Link href={trackHref(r.track)} className="underline decoration-dotted underline-offset-2">{r.track}</Link>{r.distance ? ` ${r.distance}m` : ""}</> : "—") },
    { key: "race", label: "Race", tip: "", value: (r) => r.raceName, asc: true, render: (r) => <span className="text-xs text-ink-secondary">{r.raceName ?? "—"}</span> },
    { key: "horse", label: "Horse", tip: "", value: (r) => r.horse, strong: true, asc: true },
    { key: "other", label: other === "jockey" ? "Jockey" : "Trainer", tip: "", value: (r) => r.other, asc: true },
    { key: "finish", label: "Finish", tip: "", right: true, value: (r) => r.finish, asc: true, render: (r) => <span className={r.finish === 1 ? "font-semibold text-accent" : ""}>{ord(r.finish)}{r.runners ? ` of ${r.runners}` : ""}</span> },
    { key: "margin", label: "Beaten", tip: "Lengths.", right: true, value: (r) => r.margin, asc: true, render: (r) => (r.margin === null ? "—" : r.finish === 1 ? "won" : `${r.margin.toFixed(1)}L`) },
    { key: "sp", label: "SP", tip: "", right: true, value: (r) => r.sp, asc: true, render: (r) => (r.sp === null ? "—" : `$${r.sp.toFixed(2)}`) },
    { key: "going", label: "Going", tip: "", value: (r) => r.going, asc: true },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => `${r.raceId}:${r.horse}`} searchKeys={["horse", "track", "other"]} defaultSort="date" noun="runs" />;
}

/** What a person has running today and tomorrow. */
export function UpcomingTable({ rows, other, atTrack }: { rows: Upcoming[]; other: "jockey" | "trainer"; /** The person's record by track, so each runner shows how they go where it runs. */ atTrack?: Breakdown[] }) {
  const clockOf = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "");
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const here = (track: string) => atTrack?.find((b) => norm(b.label) === norm(track));
  const cols: Column<Upcoming>[] = [
    { key: "when", label: "Jumps", tip: "", value: (r) => r.jumpTime ?? r.date, asc: true, render: (r) => `${day(r.date)} ${clockOf(r.jumpTime)}` },
    { key: "race", label: "Race", tip: "", value: (r) => `${r.track} R${r.raceNumber}`, asc: true, render: (r) => <Link href={`/racing/${r.date}/${r.meetingId}/${r.raceId}`} className="underline decoration-dotted underline-offset-2">{r.track} R{r.raceNumber}</Link> },
    { key: "horse", label: "Horse", tip: "", value: (r) => r.horse, strong: true, asc: true, render: (r) => <span className={r.scratched ? "line-through text-ink-soft" : ""}>{r.tabNumber}. {r.horse}</span> },
    { key: "other", label: other === "jockey" ? "Jockey" : "Trainer", tip: "", value: (r) => r.other ?? null, asc: true },
    { key: "market", label: "Market", tip: "", right: true, value: (r) => r.marketPrice ?? null, asc: true, render: (r) => (r.marketPrice ? `$${r.marketPrice.toFixed(2)}` : "—") },
    { key: "rated", label: "Rated", tip: "Our price.", right: true, value: (r) => r.ratedPrice, asc: true, render: (r) => `$${r.ratedPrice.toFixed(2)}` },
    { key: "call", label: "Call", tip: "", value: (r) => r.signal ?? null, render: (r) => (r.signal === "back" ? <span className="badge badge-back">Bet</span> : r.signal === "lay" ? <span className="badge badge-lay">Lay</span> : "") },
    ...(atTrack ? [{ key: "here", label: "Their record here", tip: "This person's runs, wins and Power at this track.", right: true, value: (r: Upcoming) => here(r.track)?.power ?? null, render: (r: Upcoming) => { const b = here(r.track); return b ? <span className={tone(b.power)}>{b.wins} / {b.rides}, {signed(b.power)}</span> : <span className="text-ink-soft">first time here</span>; } } satisfies Column<Upcoming>] : []),
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => `${r.raceId}:${r.tabNumber}`} searchKeys={["horse", "race"]} defaultSort="when" noun="runners" />;
}

const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(0)}%`);

/** How races are run at one track, trip by trip. */
export function TrackShapeTable({ rows }: { rows: TrackShape[] }) {
  const cols: Column<TrackShape>[] = [
    { key: "distance", label: "Distance", tip: "Click a distance for its page.", value: (r) => r.distance, strong: true, asc: true, render: (r) => <Link href={distanceHref(r.distance)} className="underline decoration-dotted underline-offset-2">{r.distance}m</Link> },
    { key: "front", label: "Leader wins", tip: "How often the horse that led won, one row a race.", right: true, value: (r) => r.frontRunnerWinPct, render: (r) => <span className={`font-semibold ${r.frontRunnerWinPct !== null && r.frontRunnerWinPct >= 30 ? "text-accent" : ""}`}>{pct(r.frontRunnerWinPct)}</span> },
    { key: "placed", label: "Leader places", tip: "How often the horse that led held a place.", right: true, value: (r) => r.leaderPlacedPct, render: (r) => pct(r.leaderPlacedPct) },
    { key: "races", label: "Races", tip: "Races behind the leader figures.", right: true, value: (r) => r.races },
    { key: "early", label: "Early %", tip: "Share of the race's time spent in the early section.", right: true, value: (r) => r.earlyPct, render: (r) => pct(r.earlyPct) },
    { key: "mid", label: "Mid %", tip: "Share spent in the middle.", right: true, value: (r) => r.midPct, render: (r) => pct(r.midPct) },
    { key: "finish", label: "Last 600 %", tip: "Share spent in the last 600.", right: true, value: (r) => r.finishPct, render: (r) => pct(r.finishPct) },
    { key: "sample", label: "Runs", tip: "", right: true, value: (r) => r.sample },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => String(r.distance)} searchKeys={["distance"]} defaultSort="distance" noun="distances" />;
}

/** One distance across tracks: where the leaders win and where the closers do. */
export function DistanceShapeTable({ rows }: { rows: (TrackShape & { track: string })[] }) {
  const cols: Column<TrackShape & { track: string }>[] = [
    { key: "track", label: "Track", tip: "Click a track for its page.", value: (r) => r.track, strong: true, asc: true, render: (r) => <Link href={trackHref(r.track)} className="underline decoration-dotted underline-offset-2">{r.track}</Link> },
    { key: "front", label: "Leader wins", tip: "How often the horse that led won here over this trip, one row a race.", right: true, value: (r) => r.frontRunnerWinPct, render: (r) => <span className={`font-semibold ${r.frontRunnerWinPct !== null && r.frontRunnerWinPct >= 30 ? "text-accent" : ""}`}>{pct(r.frontRunnerWinPct)}</span> },
    { key: "placed", label: "Leader places", tip: "How often the horse that led held a place.", right: true, value: (r) => r.leaderPlacedPct, render: (r) => pct(r.leaderPlacedPct) },
    { key: "races", label: "Races", tip: "Races behind the leader figures.", right: true, value: (r) => r.races },
    { key: "early", label: "Early %", tip: "", right: true, value: (r) => r.earlyPct, render: (r) => pct(r.earlyPct) },
    { key: "finish", label: "Last 600 %", tip: "", right: true, value: (r) => r.finishPct, render: (r) => pct(r.finishPct) },
    { key: "sample", label: "Runs", tip: "", right: true, value: (r) => r.sample },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => r.track} searchKeys={["track"]} defaultSort="front" noun="tracks" minRows={{ key: "races", min: 30, label: "Show tracks under 30 races" }} />;
}

/** Tempo benchmarks at one track: early, middle and last 600 by trip and going. */
export function TrackTempoTable({ rows }: { rows: TrackTempo[] }) {
  const secs = (v: number | null) => (v === null ? "—" : v.toFixed(2));
  const cols: Column<TrackTempo>[] = [
    { key: "band", label: "Trip", tip: "", value: (r) => r.band, strong: true, asc: true },
    { key: "condition", label: "Going", tip: "", value: (r) => r.condition, asc: true },
    { key: "early", label: "Early", tip: "Typical early section, seconds.", right: true, value: (r) => r.earlyMean, asc: true, render: (r) => secs(r.earlyMean) },
    { key: "middle", label: "Middle", tip: "Typical middle section, seconds.", right: true, value: (r) => r.middleMean, asc: true, render: (r) => secs(r.middleMean) },
    { key: "finish", label: "Last 600", tip: "Typical last 600, seconds.", right: true, value: (r) => r.finish600Mean, asc: true, render: (r) => secs(r.finish600Mean) },
    { key: "coef", label: "Tempo cost", tip: "Seconds added to the last 600 for every second the early part is run quicker. Bigger means a hot tempo hurts more here.", right: true, value: (r) => r.coefficient, render: (r) => (r.coefficient === null ? "—" : r.coefficient.toFixed(3)) },
    { key: "sample", label: "Runs", tip: "", right: true, value: (r) => r.sample },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => `${r.band} ${r.condition}`} searchKeys={["band", "condition"]} defaultSort="" noun="bands" />;
}

/** Races still to run at a track or over a distance. */
export function UpcomingRacesTable({ rows }: { rows: UpcomingRace[] }) {
  const clockOf = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "");
  const cols: Column<UpcomingRace>[] = [
    { key: "when", label: "Jumps", tip: "", value: (r) => r.jumpTime ?? r.date, asc: true, render: (r) => `${day(r.date)} ${clockOf(r.jumpTime)}` },
    { key: "race", label: "Race", tip: "Click for the race page.", value: (r) => `${r.track} R${r.raceNumber}`, asc: true, render: (r) => <Link href={`/racing/${r.date}/${r.meetingId}/${r.raceId}`} className="underline decoration-dotted underline-offset-2">{r.track} R{r.raceNumber}</Link> },
    { key: "name", label: "", tip: "", value: (r) => r.name, asc: true, render: (r) => <span className="text-xs text-ink-secondary">{r.name}</span> },
    { key: "distance", label: "Trip", tip: "Click for the distance's page.", right: true, value: (r) => r.distance, asc: true, render: (r) => <Link href={distanceHref(r.distance)} className="underline decoration-dotted underline-offset-2">{r.distance}m</Link> },
    { key: "going", label: "Going", tip: "", value: (r) => r.going, asc: true },
    { key: "runners", label: "Runners", tip: "", right: true, value: (r) => r.runners },
    { key: "fav", label: "Favourite", tip: "The market favourite, its price and ours.", value: (r) => r.fav?.horse ?? null, asc: true, render: (r) => (r.fav ? `${r.fav.horse} ${r.fav.marketPrice ? `$${r.fav.marketPrice.toFixed(2)}` : ""} (ours $${r.fav.ratedPrice.toFixed(2)})` : "—") },
    { key: "calls", label: "Calls", tip: "Bets and lays we have on it.", right: true, value: (r) => r.calls },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => r.raceId} searchKeys={["race", "name", "fav"]} defaultSort="when" noun="races" />;
}
