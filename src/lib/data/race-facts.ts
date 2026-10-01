import "server-only";

import { hubPeople, type Person } from "./hub";
import { personKey } from "./people";

/** A person's standing, for a runner's card: all time and at this track. */
export interface PersonPower {
  key: string;
  power: number;
  rides: number;
  wins: number;
  rank: number;
  of: number;
}

const brief = (p: Person, i: number, of: number): PersonPower => ({ key: p.key, power: p.power, rides: p.rides, wins: p.wins, rank: i + 1, of });

/** Power for every jockey and trainer in a race, keyed by person key, from the daily snapshot. */
export async function racePeople(names: { jockeys: (string | undefined)[]; trainers: (string | undefined)[] }): Promise<Record<string, PersonPower>> {
  const [jockeys, trainers] = await Promise.all([hubPeople("jockey"), hubPeople("trainer")]);
  const out: Record<string, PersonPower> = {};
  const add = (list: Person[], wanted: Set<string>) => {
    list.forEach((p, i) => { if (wanted.has(p.key)) out[p.key] = brief(p, i, list.length); });
  };
  add(jockeys, new Set(names.jockeys.map(personKey).filter((k): k is string => Boolean(k))));
  add(trainers, new Set(names.trainers.map(personKey).filter((k): k is string => Boolean(k))));
  return out;
}
