import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import type { StoredCard } from "@/lib/model/store";
import { callEdge, callPrice, type Signal } from "@/lib/model/types";
import { PERIODS, type RecordStats, type SideStats, type TipSource } from "./stats";

export type { Period, RecordStats, SideStats, TipSource } from "./stats";

/**
 * The tips ledger. A call is written the first time it appears on a card and
 * settled once the race has a result, at the best price it was up at: a
 * member could have taken any price while the call was live, so each rebuild
 * lifts a bet's price to the market's high and drops a lay's to its low.
 * Nothing is ever removed, so the record on the home page is the record.
 */

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
  units?: number | null;
  settled_at?: string | null;
}

/**
 * What a call settles at. A bet at the better of the best bookmaker price
 * seen and the Betfair SP, since a member could have taken either; a lay at
 * the lay price it was quoted at.
 */
export const settledAt = (side: Signal, struck: number, bsp?: number | null) => (side === "back" && bsp && bsp > struck ? bsp : struck);

/** The price a member would rather have had: longer for a bet, shorter for a lay. */
export const betterPrice = (side: Signal, a: number, b: number) => (side === "back" ? Math.max(a, b) : Math.min(a, b));

/** Level stakes, one unit, at the published price. */
export function settle(side: Signal, price: number, finish: number): number {
  const won = finish === 1;
  if (side === "back") return won ? Math.round((price - 1) * 100) / 100 : -1;
  return won ? -Math.round((price - 1) * 100) / 100 : 1;
}

/** Rows for every call on a card, settled where the race has run. */
export function rowsFor(date: string, card: StoredCard, source: TipSource = "model"): TipRow[] {
  const tagOf = new Map(card.selections.map((s) => [`${s.raceId}:${s.tabNumber}`, s.tag]));
  const out: TipRow[] = [];
  for (const m of card.meetings) {
    for (const r of m.races) {
      for (const x of r.runners) {
        if (!x.signal || x.scratched || !x.marketPrice) continue;
        // A lay is struck, and settles, at the exchange price; a bet at the bookmakers' best.
        const price = callPrice(x) ?? x.marketPrice;
        const resulted = Boolean(r.result?.length);
        const finish = resulted ? (x.finishPosition ?? 0) : undefined;
        const placing = resulted ? r.placings?.find((p) => p.tabNumber === x.tabNumber) : undefined;
        const at = finish !== undefined ? settledAt(x.signal, price, placing?.bsp) : price;
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
          ...(finish !== undefined
            ? { finish_position: finish, sp: placing?.sp ?? null, units: settle(x.signal, at, finish), settled_at: new Date().toISOString() }
            : {}),
        });
      }
    }
  }
  return out;
}

/**
 * Called after every card build. New calls are inserted at today's price;
 * calls already on the ledger move to the better price when the market has
 * offered one, and pick up a result.
 */
export async function recordTips(date: string, card: StoredCard): Promise<void> {
  const db = supabaseAdmin();
  const rows = rowsFor(date, card);
  if (rows.length === 0) return;
  const { data: existing, error } = await db.from("tips").select("race_id, tab_number, settled_at, market_price").eq("date", date).eq("source", "model");
  if (error) {
    console.error("[tips]", error.message);
    return;
  }
  const seen = new Map((existing ?? []).map((e) => [`${e.race_id}:${e.tab_number}`, { settled: Boolean(e.settled_at), price: Number(e.market_price) }]));
  const fresh = rows.filter((r) => !seen.has(`${r.race_id}:${r.tab_number}`));
  if (fresh.length) {
    const { error: e } = await db.from("tips").insert(fresh);
    if (e) console.error("[tips] insert", e.message);
  }
  // Open calls follow the best price seen, and settle at it once the race
  // has run. Runners scratched after publish never get a result and stay
  // open; they count for nothing.
  for (const r of rows) {
    const was = seen.get(`${r.race_id}:${r.tab_number}`);
    if (!was || was.settled) continue;
    const price = betterPrice(r.side, was.price, r.market_price);
    const change = r.settled_at
      ? { market_price: price, finish_position: r.finish_position, sp: r.sp, units: settle(r.side, price, r.finish_position ?? 0), settled_at: r.settled_at }
      : price !== was.price
        ? { market_price: price }
        : undefined;
    if (!change) continue;
    const { error: e } = await db.from("tips").update(change).eq("race_id", r.race_id).eq("tab_number", r.tab_number).eq("source", "model");
    if (e) console.error("[tips] update", e.message);
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

const empty = (): SideStats => ({ n: 0, hit: 0, units: 0, roi: 0 });

function tally(rows: { side: Signal; units: number; finish_position: number }[]): { bets: SideStats; lays: SideStats } {
  const bets = empty(), lays = empty();
  for (const r of rows) {
    const s = r.side === "back" ? bets : lays;
    s.n++;
    s.units += Number(r.units);
    if (r.side === "back" ? r.finish_position === 1 : r.finish_position !== 1) s.hit++;
  }
  for (const s of [bets, lays]) {
    s.units = Math.round(s.units * 100) / 100;
    s.roi = s.n ? s.units / s.n : 0;
  }
  return { bets, lays };
}

/** The settled record for each period, one query. */
export async function recordStats(today: string): Promise<RecordStats[]> {
  const { data, error } = await supabaseAdmin()
    .from("tips")
    .select("date, side, units, finish_position, source")
    .not("settled_at", "is", null);
  if (error) console.error("[tips]", error.message);
  const rows = (data ?? []) as { date: string; side: Signal; units: number; finish_position: number; source: TipSource }[];
  const day = new Date(`${today}T12:00:00Z`).getTime();
  return PERIODS.map((p) => {
    const from = p.days ? new Date(day - p.days * 86400_000).toISOString().slice(0, 10) : undefined;
    const inWindow = rows.filter((r) => !from || r.date >= from);
    const dates = inWindow.map((r) => r.date).sort();
    const { bets, lays } = tally(inWindow);
    return { period: p.id, from, bets, lays, net: Math.round((bets.units + lays.units) * 100) / 100, backtest: inWindow.some((r) => r.source === "backtest"), since: dates[0] };
  });
}
