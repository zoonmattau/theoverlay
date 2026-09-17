import "server-only";
import { cacheLife } from "next/cache";

import { hubPeople, hubTrackDistances, hubTrackExtra, hubTracks, type Person } from "./hub";
import { personKey } from "./people";
import type { GoingBand } from "@/lib/model/types";

/** What the Datahub knows about the track and trip a race is run over. */
export interface RaceFacts {
  track: string;
  distance: number;
  /** Lengths quicker (+) or slower (-) than typical, the track over all its distances. */
  trackSpeed: number | null;
  /** Typical time over this trip here on this going, and the quickest we hold. */
  standard: number | null;
  quickest: number | null;
  onGoing: string;
  frontRunnerWinPct: number | null;
  leaderPlacedPct: number | null;
  /** Seconds the last 600 gives up for each second the early part is run quicker, here over this trip band. */
  tempoCost: number | null;
  runs: number;
}

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
/** HorseEdge's tempo bands. */
const bandOf = (d: number) => (d < 1200 ? "1000-1200" : d < 1450 ? "1200-1400" : d < 1750 ? "1500-1700" : d < 2300 ? "1800-2200" : "2400+");

export async function raceFacts(trackName: string, distance: number, going: GoingBand): Promise<RaceFacts | undefined> {
  "use cache";
  cacheLife("hours");
  const tracks = await hubTracks();
  const t = tracks.find((x) => norm(x.track) === norm(trackName));
  if (!t) return undefined;
  const [all, extra] = await Promise.all([hubTrackDistances(), hubTrackExtra(t.track)]);
  const td = all.find((r) => r.track === t.track && r.distance === distance);
  const shape = extra.shapes.find((s) => s.distance === distance);
  const tempo = extra.tempo.find((x) => x.condition === going && x.band === bandOf(distance)) ?? extra.tempo.find((x) => x.band === bandOf(distance));
  const onGoing = td ? (td[going] ?? td.median) : null;
  return {
    track: t.track, distance,
    trackSpeed: t.speed,
    standard: onGoing, quickest: td?.best ?? null, onGoing: td && td[going] !== null ? going : "all goings",
    frontRunnerWinPct: shape && (shape.races ?? 0) >= 20 ? shape.frontRunnerWinPct : null, leaderPlacedPct: shape && (shape.races ?? 0) >= 20 ? shape.leaderPlacedPct : null,
    tempoCost: tempo?.coefficient ?? null,
    runs: td?.runs ?? 0,
  };
}

/** A person's standing, for a runner's card: all time and at this track. */
export interface PersonPower {
  key: string;
  power: number;
  rides: number;
  wins: number;
  rank: number;
  of: number;
  here?: { power: number; rides: number; wins: number };
}

const brief = (p: Person, i: number, of: number): PersonPower => ({ key: p.key, power: p.power, rides: p.rides, wins: p.wins, rank: i + 1, of });

/** Power for every jockey and trainer in a race, all time and at the track, keyed by person key. */
export async function racePeople(trackName: string, names: { jockeys: (string | undefined)[]; trainers: (string | undefined)[] }): Promise<Record<string, PersonPower>> {
  const tracks = await hubTracks();
  const t = tracks.find((x) => norm(x.track) === norm(trackName));
  const [jockeys, trainers, jockeysHere, trainersHere] = await Promise.all([
    hubPeople("jockey"), hubPeople("trainer"),
    t ? hubPeople("jockey", { tracks: [t.track] }) : Promise.resolve([] as Person[]),
    t ? hubPeople("trainer", { tracks: [t.track] }) : Promise.resolve([] as Person[]),
  ]);
  const out: Record<string, PersonPower> = {};
  const add = (list: Person[], here: Person[], wanted: Set<string>) => {
    list.forEach((p, i) => {
      if (!wanted.has(p.key)) return;
      const h = here.find((x) => x.key === p.key);
      out[p.key] = { ...brief(p, i, list.length), here: h && h.rides >= 5 ? { power: h.power, rides: h.rides, wins: h.wins } : undefined };
    });
  };
  add(jockeys, jockeysHere, new Set(names.jockeys.map(personKey).filter((k): k is string => Boolean(k))));
  add(trainers, trainersHere, new Set(names.trainers.map(personKey).filter((k): k is string => Boolean(k))));
  return out;
}
