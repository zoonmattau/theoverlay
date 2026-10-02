import "server-only";

import { revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/billing/access";
import { betwatchMarkets } from "@/lib/betwatch/client";
import { readPriceBook, writePriceBook } from "@/lib/betwatch/prices";
import { settleCreatorTips } from "@/lib/creators";
import { postWinners } from "@/lib/discord";
import { getRace } from "@/lib/formking/client";
import type { RaceSummary } from "@/lib/formking/types";
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
  if (race.result?.length && !race.handSettled) return { ok: false, error: "That race has its official result." };
  const editing = Boolean(race.result?.length);
  const placed = order.filter((n) => Number.isInteger(n) && n > 0);
  if (placed.length < 1 || new Set(placed).size !== placed.length) return { ok: false, error: "Give the first home, then as many of the next three as you have, no repeats." };
  for (const n of placed) {
    const x = race.runners.find((r) => r.tabNumber === n);
    if (!x) return { ok: false, error: `There is no number ${n} in this race.` };
    if (x.scratched) return { ok: false, error: `${x.horseName} was scratched.` };
  }

  const before = new Map<string, PublishedRace>(stored.card.meetings.flatMap((m) => m.races.map((r) => [r.raceId, r] as const)));
  race.result = placed;
  // Placings only: margins, starting prices and dividends come with the feed's result.
  race.placings = placed.map((n, i) => ({ position: i + 1, tabNumber: n }));
  race.handSettled = true;
  for (const x of race.runners) {
    const pos = placed.indexOf(x.tabNumber);
    // The rest are unplaced: 0 settles as a loss for a bet and a hold for a lay, and reads as unplaced.
    x.finishPosition = x.scratched ? undefined : pos >= 0 ? pos + 1 : 0;
  }
  await writeStoredCard(date, stored.card, 0);
  if (editing) {
    // Reopen the calls in this race so they settle again on the corrected result.
    const db = supabaseAdmin();
    await db.from("tips").update({ finish_position: null, sp: null, units: null, settled_at: null }).eq("date", date).eq("race_id", raceId);
    await db.from("creator_tips").update({ finish_position: null, sp: null, units: null, settled_at: null }).eq("date", date).eq("race_id", raceId);
  }
  await recordTips(date, stored.card);
  await settleCreatorTips(date, stored.card);
  revalidateTag(`card-${date}`, "max");
  await postWinners(date, before, stored.card);
  return { ok: true, track: meeting.track, raceNumber: race.raceNumber };
}

/**
 * BetWatch's results, laid straight on the stored card when a rebuild cannot
 * run: Form King out of credits or past the daily cap. A result normally
 * reaches the card through a rebuild, and a rebuild needs Form King, so on
 * 30 Sep 2026 Rosehill R5's result sat in the price book for an hour with
 * nothing settling. Each race lands the way a hand result does, placings
 * and Betfair SP, and Form King's official one replaces it when it returns.
 * Costs no Form King credits. Returns the races it settled.
 */
export async function settleFromBook(date: string): Promise<number> {
  const [stored, book] = await Promise.all([readStoredCard(date), readPriceBook(date)]);
  if (!stored) return 0;
  const before = new Map<string, PublishedRace>(stored.card.meetings.flatMap((m) => m.races.map((r) => [r.raceId, structuredClone(r)] as const)));
  let settled = 0;
  for (const m of stored.card.meetings) {
    for (const race of m.races) {
      const live = book.races[race.raceId];
      if (race.result?.length || race.abandoned || !live?.result) continue;
      const position = new Map<number, number>();
      live.result.placings.forEach((tabs, i) => tabs.forEach((t) => position.set(t, i + 1)));
      const order = [...position.entries()].sort((a, b) => a[1] - b[1]).map(([tab]) => tab);
      if (order.length === 0) continue;
      race.result = order.slice(0, 4);
      race.placings = order.slice(0, 4).map((tab) => ({ position: position.get(tab)!, tabNumber: tab, bsp: live.result!.bsp[String(tab)] || undefined }));
      race.handSettled = true;
      for (const x of race.runners) {
        if (live.runners[String(x.tabNumber)]?.scratched) x.scratched = true;
        x.finishPosition = x.scratched ? undefined : (position.get(x.tabNumber) ?? 0);
      }
      settled++;
    }
  }
  if (settled === 0) return 0;
  await writeStoredCard(date, stored.card, 0);
  await recordTips(date, stored.card);
  await settleCreatorTips(date, stored.card);
  revalidateTag(`card-${date}`, "max");
  await postWinners(date, before, stored.card);
  return settled;
}

/**
 * Asks BetWatch for one race's result now rather than waiting for the next
 * poll, and settles it if it is in: placings and Betfair SP, the way the
 * poll would. No Form King credits; the official result still follows.
 */
export async function checkBetwatchResult(date: string, raceId: string): Promise<{ ok: true; track: string; raceNumber: number } | { ok: false; error: string }> {
  const [stored, book] = await Promise.all([readStoredCard(date), readPriceBook(date)]);
  if (!stored) return { ok: false, error: "No card for that day." };
  const meeting = stored.card.meetings.find((m) => m.races.some((r) => r.raceId === raceId));
  const race = meeting?.races.find((r) => r.raceId === raceId);
  if (!meeting || !race) return { ok: false, error: "That race is not on the card." };
  if (race.result?.length) return { ok: false, error: "That race already has its result." };
  const id = book.ids[raceId];
  if (!id) return { ok: false, error: "BetWatch has no market for this race. Settle by hand." };
  let m: Awaited<ReturnType<typeof betwatchMarkets>>;
  try {
    m = await betwatchMarkets(id);
  } catch (err) {
    return { ok: false, error: `BetWatch did not answer: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!/resulted|interim/i.test(m.status) || !m.results?.length) return { ok: false, error: `No result on BetWatch yet (${m.status}). Try again in a minute, or settle by hand.` };
  const bsp: Record<string, number> = {};
  const bspPlace: Record<string, number> = {};
  for (const r of m.runners) {
    if (r.bsp) bsp[String(r.number)] = r.bsp;
    if (r.bspPlace) bspPlace[String(r.number)] = r.bspPlace;
  }
  const at = new Date().toISOString();
  book.races[raceId] = { ...(book.races[raceId] ?? { betwatchId: id, runners: {} }), at: book.races[raceId]?.at ?? at, status: m.status, result: { placings: m.results, bsp, bspPlace, at } };
  await writePriceBook(date, book);
  if ((await settleFromBook(date)) === 0) return { ok: false, error: "The result is in but nothing settled. Settle by hand." };
  return { ok: true, track: meeting.track, raceNumber: race.raceNumber };
}

/**
 * Buys the race from Form King now, rather than waiting for the next
 * rebuild, and applies the official result if it has landed: placings with
 * margins, starting prices and dividends, every runner's finish, the
 * ledgers settled, the winners posted. Two credits. A hand result gives way.
 */
export async function fetchOfficialResult(date: string, meetingId: string, raceId: string): Promise<{ ok: true; track: string; raceNumber: number; placings: number } | { ok: false; error: string }> {
  const stored = await readStoredCard(date);
  if (!stored) return { ok: false, error: "No card for that day." };
  const meeting = stored.card.meetings.find((m) => m.meetingId === meetingId);
  const race = meeting?.races.find((r) => r.raceId === raceId);
  if (!meeting || !race) return { ok: false, error: "That race is not on the card." };
  if (race.result?.length && !race.handSettled) return { ok: false, error: "The official result is already in." };
  let raw: RaceSummary;
  try {
    raw = await getRace(meetingId, raceId, { ttlMs: 0, includeScratchings: true });
  } catch (err) {
    return { ok: false, error: `Form King did not answer: ${err instanceof Error ? err.message : String(err)}` };
  }
  const placed = raw.entries.filter((e) => e.horseResult && e.horseResult.finishPosition > 0).sort((a, b) => a.horseResult!.finishPosition - b.horseResult!.finishPosition);
  if (placed.length === 0) return { ok: false, error: "No official result yet. Try again in a minute, or settle by hand." };
  const before = new Map<string, PublishedRace>(stored.card.meetings.flatMap((m) => m.races.map((r) => [r.raceId, r] as const)));
  race.result = placed.slice(0, 4).map((e) => e.number);
  race.placings = placed.slice(0, 4).map((e) => {
    const h = e.horseResult!;
    return {
      position: h.finishPosition,
      tabNumber: e.number,
      margin: h.margin,
      sp: h.startingPrice || undefined,
      bsp: h.betfairStartingPrice || undefined,
      win: h.finishPosition === 1 ? h.toteWin || h.bestToteWin || h.startingPrice || undefined : undefined,
      place: h.finishPosition <= 3 ? h.totePlace || h.betfairPlaceDiv || undefined : undefined,
    };
  });
  race.handSettled = undefined;
  const finish = new Map(raw.entries.map((e) => [e.number, e.horseResult?.finishPosition]));
  for (const x of race.runners) x.finishPosition = x.scratched ? undefined : (finish.get(x.tabNumber) ?? 0);
  await writeStoredCard(date, stored.card, 0);
  // Anything settled by hand settles again on the official numbers.
  const db = supabaseAdmin();
  await db.from("tips").update({ finish_position: null, sp: null, units: null, settled_at: null }).eq("date", date).eq("race_id", raceId);
  await db.from("creator_tips").update({ finish_position: null, sp: null, units: null, settled_at: null }).eq("date", date).eq("race_id", raceId);
  await recordTips(date, stored.card);
  await settleCreatorTips(date, stored.card);
  revalidateTag(`card-${date}`, "max");
  await postWinners(date, before, stored.card);
  return { ok: true, track: meeting.track, raceNumber: race.raceNumber, placings: race.placings.length };
}
