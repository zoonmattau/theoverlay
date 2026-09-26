import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import type { StoredCard } from "@/lib/model/store";
import { callEdge, callPrice, callUnits, stakeOf, type Signal } from "@/lib/model/types";
import { PERIODS, type RecordStats, type SideStats, type TipSource } from "./stats";

export type { Period, RecordStats, SideStats, TipSource } from "./stats";

/**
 * The tips ledger, on the user's rules of 26 Sep 2026. A call, once made, is
 * on the record for the day, void only if the horse is scratched or the race
 * called off.
 * - A bet settles at the best of the official SP, the Betfair SP, and any
 *   fixed odds seen while it was a bet, the price at the jump included.
 * - A lay settles at the shortest lay price seen while it was a lay, or the
 *   Betfair SP when that is shorter.
 */

/**
 * A void: settled, no units, and no finishing position, which is how every
 * count tells it from a run. A runner scratched after the call settles this way.
 */
export const voidSettlement = () => ({ finish_position: null, sp: null, units: 0, settled_at: new Date().toISOString() });

export interface TipRow {
  date: string;
  meeting_id: string;
  race_id: string;
  race_number: number;
  track: string;
  tab_number: number;
  horse_name: string;
  side: Signal;
  tag: string | null;
  rated_price: number;
  market_price: number;
  edge: number | null;
  source: TipSource;
  published_at?: string;
  finish_position?: number | null;
  sp?: number | null;
  /** Units staked: one, or a tenth on a Way Overlay. */
  stake: number;
  units?: number | null;
  settled_at?: string | null;
}

/**
 * What a call settles at, from the price the ledger recorded for it. A bet at
 * the longest of that, the price at the jump and the two starting prices; a
 * lay at the shorter of that and the Betfair SP.
 */
export function settlePrice(side: Signal, recorded: number, placing?: { sp?: number | null; bsp?: number | null }, jump?: number): number {
  const at = side === "back" ? Math.max(recorded, jump ?? 0, placing?.sp ?? 0, placing?.bsp ?? 0) : placing?.bsp && placing.bsp > 1 && placing.bsp < recorded ? placing.bsp : recorded;
  return cents(at);
}

/** To the cent, as the ledger stores prices and units, so a rebuild finds nothing to change. */
const cents = (n: number) => Math.round(n * 100) / 100;

/** settlePrice with the Betfair SP alone, for callers that have nothing else. */
export const settledAt = (side: Signal, struck: number, bsp?: number | null) => settlePrice(side, struck, { bsp });

/** The price a member would rather have had: longer for a bet, shorter for a lay. */
export const betterPrice = (side: Signal, a: number, b: number) => (side === "back" ? Math.max(a, b) : Math.min(a, b));

/** Level stakes at the published price: one unit, or the stake given (a tenth on a Way Overlay). */
export function settle(side: Signal, price: number, finish: number, stake = 1): number {
  return callUnits(side, price, finish, stake);
}

/** A row for every call on a card, at its price now. */
export function rowsFor(date: string, card: StoredCard, source: TipSource = "model"): TipRow[] {
  const tagOf = new Map(card.selections.map((s) => [`${s.raceId}:${s.tabNumber}`, s.tag]));
  const out: TipRow[] = [];
  for (const m of card.meetings) {
    for (const r of m.races) {
      for (const x of r.runners) {
        if (!x.signal || x.scratched || !x.marketPrice) continue;
        // A lay is struck at the exchange price; a bet at the bookmakers' best. recordTips settles it.
        const at = callPrice(x) ?? x.marketPrice;
        const stake = stakeOf(x);
        out.push({
          date,
          meeting_id: m.meetingId,
          race_id: r.raceId,
          race_number: r.raceNumber,
          track: m.track,
          tab_number: x.tabNumber,
          horse_name: x.horseName,
          side: x.signal,
          tag: tagOf.get(`${r.raceId}:${x.tabNumber}`) ?? (x.signal === "lay" ? "lay" : "bet"),
          rated_price: x.ratedPrice,
          market_price: at,
          edge: callEdge(x) ?? null,
          source,
          stake,
        });
      }
    }
  }
  return out;
}

interface Held {
  race_id: string;
  tab_number: number;
  side: Signal;
  market_price: number;
  stake: number | null;
  tag: string | null;
  finish_position: number | null;
  sp: number | null;
  units: number | null;
  settled_at: string | null;
}

/**
 * Called after every card build: new calls join the ledger, and every call
 * on it is brought to where the rules above put it. Each call's target is
 * worked out from scratch and written only when it differs, so a rebuild,
 * a late result or a hand settlement all land the same way.
 */
export async function recordTips(date: string, card: StoredCard): Promise<void> {
  if (!card.meetings.length) return;
  const db = supabaseAdmin();
  const rows = rowsFor(date, card);
  const { data: existing, error } = await db.from("tips").select("race_id, tab_number, side, market_price, stake, tag, finish_position, sp, units, settled_at").eq("date", date).eq("source", "model");
  if (error) {
    console.error("[tips]", error.message);
    return;
  }
  const key = (r: { race_id: string; tab_number: number }) => `${r.race_id}:${r.tab_number}`;
  const held = new Map(((existing ?? []) as Held[]).map((e) => [key(e), e]));
  const fresh = rows.filter((r) => !held.has(key(r)));
  if (fresh.length) {
    const { error: e } = await db.from("tips").insert(fresh);
    if (e) console.error("[tips] insert", e.message);
    for (const r of fresh) held.set(key(r), { ...r, finish_position: null, sp: null, units: null, settled_at: null });
  }
  const onCard = new Map(rows.map((r) => [key(r), r]));
  const racesById = new Map(card.meetings.flatMap((m) => m.races.map((r) => [r.raceId, r] as const)));
  const now = new Date().toISOString();

  for (const [k, was] of held) {
    const race = racesById.get(was.race_id);
    // A race missing from this build altogether (a meeting the feed dropped) is left as it was.
    if (!race) continue;
    const x = race.runners.find((y) => y.tabNumber === was.tab_number);
    const row = onCard.get(k);
    const live = row && row.side === was.side ? row : undefined;
    const stake = Number(was.stake ?? 1);
    const price = Number(was.market_price);
    const voided = Boolean(was.settled_at) && was.finish_position === null;
    let target: Pick<Held, "market_price" | "finish_position" | "sp" | "units" | "settled_at">;
    if (race.abandoned || !x || x.scratched) {
      // A race called off or a scratching voids either side, as a bookie settles it.
      target = { market_price: price, ...voidSettlement(), settled_at: voided ? was.settled_at : now };
    } else {
      // The recorded price: a bet's longest while it was a bet, a lay's shortest while it was a lay.
      const recorded = cents(!live ? price : was.side === "back" ? Math.max(price, live.market_price) : Math.min(price, live.market_price));
      if (race.result?.length) {
        const placing = race.placings?.find((p) => p.tabNumber === was.tab_number);
        const at = settlePrice(was.side, recorded, placing, x.marketPrice);
        const finish = x.finishPosition ?? 0;
        target = { market_price: at, finish_position: finish, sp: placing?.sp ?? null, units: cents(settle(was.side, at, finish, stake)), settled_at: was.settled_at && !voided ? was.settled_at : now };
      } else {
        target = { market_price: recorded, finish_position: null, sp: null, units: null, settled_at: null };
      }
    }
    // A bet that grew into a Prime during the day is a Prime on the record: members were told so.
    const prime = live?.tag === "prime_overlay" && was.tag !== "prime_overlay" ? { tag: live.tag } : {};
    const same =
      price === target.market_price &&
      was.finish_position === target.finish_position &&
      (was.units === null ? null : Number(was.units)) === target.units &&
      Boolean(was.settled_at) === Boolean(target.settled_at) &&
      !prime.tag;
    if (same) continue;
    const { error: e } = await db.from("tips").update({ ...target, ...prime }).eq("race_id", was.race_id).eq("tab_number", was.tab_number).eq("source", "model");
    if (e) console.error("[tips] update", e.message);
  }
}

/** A call on the record: its side, its best price so far, and the rated price and edge it was called at. */
export interface RecordedCall {
  side: Signal;
  best: number;
  rated: number;
  edge: number | null;
}

/** The day's calls on the record, keyed raceId:tab, voids left out: a call once is a call for the day. */
export async function callsOnRecord(date: string): Promise<Map<string, RecordedCall>> {
  const { data, error } = await supabaseAdmin().from("tips").select("race_id, tab_number, side, market_price, rated_price, edge, finish_position, settled_at").eq("date", date).eq("source", "model");
  if (error) console.error("[tips]", error.message);
  const rows = (data ?? []) as { race_id: string; tab_number: number; side: Signal; market_price: number; rated_price: number; edge: number | null; finish_position: number | null; settled_at: string | null }[];
  return new Map(
    rows
      .filter((r) => !(r.settled_at && r.finish_position === null))
      .map((r) => [`${r.race_id}:${r.tab_number}`, { side: r.side, best: Number(r.market_price), rated: Number(r.rated_price), edge: r.edge === null ? null : Number(r.edge) }]),
  );
}

/**
 * A bet's rated price never sits above the price it is bet or settled at: it
 * keeps the ratio of rated price to price it was called at, so a bet called at
 * $9 against $7.40 and settled at $16.50 shows about $13.60, and one that
 * firms from $5 to $3 keeps its $4 (the user, 26 Sep 2026). Where the model's
 * own price is under that anyway it stands. The model's price is kept in
 * ratedUncapped and the cap is worked from it every build. The price at the
 * call comes back from the rated price and edge the ledger stored then.
 */
export function holdBetRatedUnder(card: Pick<StoredCard, "meetings">, calls: Map<string, RecordedCall>): void {
  for (const m of card.meetings) {
    for (const r of m.races) {
      for (const x of r.runners) {
        if (x.signal !== "back" || x.scratched) continue;
        const found = calls.get(`${r.raceId}:${x.tabNumber}`);
        const call = found?.side === "back" ? found : undefined;
        const model = x.ratedUncapped ?? x.ratedPrice;
        // A bet new on this build is its own call: its numbers are the ones it was called at.
        if (!call || !model || !call.rated || call.edge === null || 1 / call.rated - call.edge <= 0) continue;
        const struck = 1 / (1 / call.rated - call.edge);
        const live = Math.max(call.best, x.marketPrice ?? 0);
        const placing = r.placings?.find((p) => p.tabNumber === x.tabNumber);
        const price = r.result?.length ? settlePrice("back", live, placing, x.marketPrice) : live;
        const rated = Math.min(model, cents(price * (call.rated / struck)));
        const wasCapped = x.ratedUncapped !== undefined;
        x.ratedUncapped = rated < model ? model : undefined;
        x.ratedPrice = rated;
        x.ratedProbability = 1 / rated;
        // The edge is against the price shown beside it: the live price, or the settled one once the race has run.
        const against = r.result?.length ? price : x.marketPrice;
        if (against && rated < model) x.edge = Math.round((1 / rated - 1 / against) * 10000) / 10000;
        // No longer held down: back to the model's own edge, against the market as it was.
        else if (wasCapped && x.marketPrice) x.edge = Math.round((1 / model - 1 / x.marketPrice) * 10000) / 10000;
      }
    }
  }
}

/** The day's model calls as the ledger holds them, keyed raceId:tab: the best price seen and the units once settled. */
export async function ledgerFor(date: string): Promise<Map<string, { price: number; units?: number }>> {
  const { data, error } = await supabaseAdmin().from("tips").select("race_id, tab_number, market_price, units, settled_at").eq("date", date).eq("source", "model");
  if (error) console.error("[tips]", error.message);
  return new Map(
    ((data ?? []) as { race_id: string; tab_number: number; market_price: number; units: number | null; settled_at: string | null }[]).map((r) => [
      `${r.race_id}:${r.tab_number}`,
      { price: Number(r.market_price), units: r.settled_at && r.units !== null ? Number(r.units) : undefined },
    ]),
  );
}

const empty = (): SideStats => ({ n: 0, hit: 0, units: 0, staked: 0, roi: 0 });

function tally(rows: { side: Signal; units: number; finish_position: number; stake?: number | null }[]): { bets: SideStats; lays: SideStats } {
  const bets = empty(), lays = empty();
  for (const r of rows) {
    const s = r.side === "back" ? bets : lays;
    s.n++;
    s.units += Number(r.units);
    s.staked += Number(r.stake ?? 1);
    if (r.side === "back" ? r.finish_position === 1 : r.finish_position !== 1) s.hit++;
  }
  for (const s of [bets, lays]) {
    s.units = Math.round(s.units * 100) / 100;
    s.staked = Math.round(s.staked * 100) / 100;
    s.roi = s.staked ? s.units / s.staked : 0;
  }
  return { bets, lays };
}

/** The settled record for each period, one query. */
export async function recordStats(today: string): Promise<RecordStats[]> {
  // Read a thousand at a time: the server hands back no more per request, and the record passes that.
  const rows: { date: string; side: Signal; units: number; finish_position: number; source: TipSource; stake: number | null }[] = [];
  for (let from = 0; from < 1_000_000; from += 1000) {
    const { data, error } = await supabaseAdmin()
      .from("tips")
      .select("date, side, units, finish_position, source, stake")
      .not("settled_at", "is", null)
      .not("finish_position", "is", null)
      .order("id")
      .range(from, from + 999);
    if (error) {
      console.error("[tips]", error.message);
      break;
    }
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < 1000) break;
  }
  const day = new Date(`${today}T12:00:00Z`).getTime();
  return PERIODS.map((p) => {
    const from = p.days ? new Date(day - p.days * 86400_000).toISOString().slice(0, 10) : undefined;
    const inWindow = rows.filter((r) => !from || r.date >= from);
    const dates = inWindow.map((r) => r.date).sort();
    const { bets, lays } = tally(inWindow);
    return { period: p.id, from, bets, lays, net: Math.round((bets.units + lays.units) * 100) / 100, backtest: inWindow.some((r) => r.source === "backtest"), since: dates[0] };
  });
}
