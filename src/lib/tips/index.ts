import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import type { StoredCard } from "@/lib/model/store";
import type { Signal } from "@/lib/model/types";
import { PERIODS, type RecordStats, type SideStats, type TipSource } from "./stats";

export type { Period, RecordStats, SideStats, TipSource } from "./stats";

/**
 * The tips ledger. A call is written the first time it appears on a card, at
 * that day's publish price, and settled once the race has a result. Nothing
 * is ever removed or re-priced, so the record on the home page is the record.
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
        const resulted = Boolean(r.result?.length);
        const finish = resulted ? (x.finishPosition ?? 0) : undefined;
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
          market_price: x.marketPrice,
          edge: x.edge ?? null,
          source,
          ...(finish !== undefined
            ? { finish_position: finish, sp: r.placings?.find((p) => p.tabNumber === x.tabNumber)?.sp ?? null, units: settle(x.signal, x.marketPrice, finish), settled_at: new Date().toISOString() }
            : {}),
        });
      }
    }
  }
  return out;
}

/**
 * Called after every card build. New calls are inserted at today's price;
 * calls already on the ledger keep theirs and only pick up a result.
 */
export async function recordTips(date: string, card: StoredCard): Promise<void> {
  const db = supabaseAdmin();
  const rows = rowsFor(date, card);
  if (rows.length === 0) return;
  const { data: existing, error } = await db.from("tips").select("race_id, tab_number, settled_at").eq("date", date).eq("source", "model");
  if (error) {
    console.error("[tips]", error.message);
    return;
  }
  const seen = new Map((existing ?? []).map((e) => [`${e.race_id}:${e.tab_number}`, Boolean(e.settled_at)]));
  const fresh = rows.filter((r) => !seen.has(`${r.race_id}:${r.tab_number}`));
  if (fresh.length) {
    const { error: e } = await db.from("tips").insert(fresh);
    if (e) console.error("[tips] insert", e.message);
  }
  // Settle what has run and is not settled yet. Runners scratched after
  // publish never get a result and stay open; they count for nothing.
  for (const r of rows.filter((r) => r.settled_at && seen.get(`${r.race_id}:${r.tab_number}`) === false)) {
    const { error: e } = await db
      .from("tips")
      .update({ finish_position: r.finish_position, sp: r.sp, units: r.units, settled_at: r.settled_at })
      .eq("race_id", r.race_id)
      .eq("tab_number", r.tab_number)
      .eq("source", "model");
    if (e) console.error("[tips] settle", e.message);
  }
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
