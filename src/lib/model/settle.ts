import "server-only";

import { revalidateTag } from "next/cache";

import { settleCreatorTips } from "@/lib/creators";
import { postWinners } from "@/lib/discord";
import { recordTips } from "@/lib/tips";
import { readStoredCard, writeStoredCard } from "./store";
import type { PublishedRace } from "./types";

/**
 * An admin watching the race settles it by hand: the first four home by
 * saddlecloth number, in order. The result goes onto the stored card the
 * way the feed's would, the ledgers settle, the winners post to Discord,
 * and Form King's official result replaces it when it lands, margins and
 * starting prices included.
 */
export async function settleByHand(date: string, raceId: string, order: number[]): Promise<{ ok: true; track: string; raceNumber: number } | { ok: false; error: string }> {
  const stored = await readStoredCard(date);
  if (!stored) return { ok: false, error: "No card for that day." };
  const meeting = stored.card.meetings.find((m) => m.races.some((r) => r.raceId === raceId));
  const race = meeting?.races.find((r) => r.raceId === raceId);
  if (!meeting || !race) return { ok: false, error: "That race is not on the card." };
  if (race.result?.length) return { ok: false, error: "That race already has a result." };
  const placed = order.filter((n) => Number.isInteger(n) && n > 0);
  if (placed.length < 1 || new Set(placed).size !== placed.length) return { ok: false, error: "Give the first home, then as many of the next three as you have, no repeats." };
  for (const n of placed) {
    const x = race.runners.find((r) => r.tabNumber === n);
    if (!x) return { ok: false, error: `There is no number ${n} in this race.` };
    if (x.scratched) return { ok: false, error: `${x.horseName} was scratched.` };
  }

  const before = new Map<string, PublishedRace>(stored.card.meetings.flatMap((m) => m.races.map((r) => [r.raceId, r] as const)));
  race.result = placed;
  race.placings = placed.map((n, i) => ({ position: i + 1, tabNumber: n }));
  for (const x of race.runners) {
    const pos = placed.indexOf(x.tabNumber);
    // The rest are unplaced: 0 settles as a loss for a bet and a hold for a lay, and reads as unplaced.
    x.finishPosition = x.scratched ? undefined : pos >= 0 ? pos + 1 : 0;
  }
  await writeStoredCard(date, stored.card, 0);
  await recordTips(date, stored.card);
  await settleCreatorTips(date, stored.card);
  revalidateTag(`card-${date}`, "max");
  await postWinners(date, before, stored.card);
  return { ok: true, track: meeting.track, raceNumber: race.raceNumber };
}
