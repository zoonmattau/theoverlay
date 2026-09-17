import "server-only";

import { personKey } from "./people";
import { racingToday } from "@/lib/model/source";
import { readStoredCard } from "@/lib/model/store";
import type { Signal } from "@/lib/model/types";

export interface Upcoming {
  date: string;
  meetingId: string;
  raceId: string;
  track: string;
  raceNumber: number;
  jumpTime?: string;
  horse: string;
  tabNumber: number;
  /** The jockey on a trainer's runner, the trainer on a jockey's. */
  other?: string;
  marketPrice?: number;
  ratedPrice: number;
  signal?: Signal;
  scratched: boolean;
}

/** yyyy-mm-dd plus one day. */
const nextDay = (date: string) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/** A person's runners on today's and tomorrow's cards that are still to run. */
export async function upcomingFor(kind: "jockey" | "trainer", key: string): Promise<Upcoming[]> {
  const today = racingToday();
  const out: Upcoming[] = [];
  for (const date of [today, nextDay(today)]) {
    const stored = await readStoredCard(date);
    if (!stored) continue;
    for (const m of stored.card.meetings) for (const r of m.races) {
      if (r.result?.length) continue;
      for (const x of r.runners) {
        if (personKey(kind === "jockey" ? x.jockey : x.trainer) !== key) continue;
        out.push({ date, meetingId: m.meetingId, raceId: r.raceId, track: m.track, raceNumber: r.raceNumber, jumpTime: r.jumpTime, horse: x.horseName, tabNumber: x.tabNumber, other: kind === "jockey" ? x.trainer : x.jockey, marketPrice: x.marketPrice, ratedPrice: x.ratedPrice, signal: x.signal, scratched: Boolean(x.scratched) });
      }
    }
  }
  return out.sort((a, b) => (a.jumpTime ?? "").localeCompare(b.jumpTime ?? ""));
}

export interface UpcomingRace {
  date: string;
  meetingId: string;
  raceId: string;
  track: string;
  raceNumber: number;
  name: string;
  distance: number;
  going: string;
  jumpTime?: string;
  runners: number;
  calls: number;
  /** The favourite and our rated price for it. */
  fav?: { horse: string; marketPrice?: number; ratedPrice: number };
}

/** Races still to run at a track, or over a distance, on today's and tomorrow's cards. */
export async function upcomingRaces(where: { track?: string; distance?: number }): Promise<UpcomingRace[]> {
  const today = racingToday();
  const out: UpcomingRace[] = [];
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const date of [today, nextDay(today)]) {
    const stored = await readStoredCard(date);
    if (!stored) continue;
    for (const m of stored.card.meetings) {
      if (where.track && norm(m.track) !== norm(where.track)) continue;
      for (const r of m.races) {
        if (r.result?.length) continue;
        if (where.distance && r.distance !== where.distance) continue;
        const live = r.runners.filter((x) => !x.scratched);
        const fav = [...live].filter((x) => x.marketPrice).sort((a, b) => a.marketPrice! - b.marketPrice!)[0];
        out.push({ date, meetingId: m.meetingId, raceId: r.raceId, track: m.track, raceNumber: r.raceNumber, name: r.name, distance: r.distance, going: r.goingText ?? r.going, jumpTime: r.jumpTime, runners: live.length, calls: live.filter((x) => x.signal).length, fav: fav ? { horse: fav.horseName, marketPrice: fav.marketPrice, ratedPrice: fav.ratedPrice } : undefined });
      }
    }
  }
  return out.sort((a, b) => (a.jumpTime ?? "").localeCompare(b.jumpTime ?? ""));
}
