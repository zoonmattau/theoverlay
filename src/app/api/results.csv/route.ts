import { connection } from "next/server";

import { supabaseAdmin } from "@/lib/billing/access";

/**
 * Every resulted call as CSV, for the public results sheet: its Data tab reads
 * this with IMPORTDATA and Google refreshes it about hourly. Resulted only, so
 * a call that can still be backed never leaves the members' pages, and voids
 * (a scratching, a race called off) are left out: the sheet does not count
 * them. Tags fold into Prime, Bet, Way and Lay (2 Oct 2026).
 */
const TAG: Record<string, string> = { prime_overlay: "Prime", top_overlay: "Prime", way_overlay: "Way", long_overlay: "Bet", bet: "Bet", lay: "Lay" };
const HEAD = ["Date", "Track", "Race", "No.", "Horse", "Call", "Tag", "Rated", "Price", "Edge", "Stake", "Finish", "Result", "Profit", "At risk"];

interface Row {
  date: string;
  track: string;
  race_number: number;
  tab_number: number;
  horse_name: string;
  side: "back" | "lay";
  tag: string | null;
  rated_price: number;
  market_price: number;
  edge: number | null;
  stake: number | null;
  finish_position: number | null;
  units: number | null;
}

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function line(t: Row): string {
  const bet = t.side === "back";
  const price = Number(t.market_price);
  const stake = Number(t.stake ?? 1);
  const units = Number(t.units ?? 0);
  const result = units > 0 ? "Win" : "Loss";
  const risk = (bet ? stake : (price - 1) * stake).toFixed(2);
  return [
    t.date, t.track, t.race_number, t.tab_number, t.horse_name, bet ? "Bet" : "Lay", TAG[t.tag ?? ""] ?? (bet ? "Bet" : "Lay"),
    Number(t.rated_price).toFixed(2), price.toFixed(2), t.edge === null ? "" : Number(t.edge).toFixed(4), stake,
    t.finish_position === 0 ? "Unplaced" : t.finish_position, result, units.toFixed(2), risk,
  ].map(cell).join(",");
}

export async function GET() {
  await connection();
  const db = supabaseAdmin();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("tips")
      .select("date, track, race_number, tab_number, horse_name, side, tag, rated_price, market_price, edge, stake, finish_position, units")
      .eq("source", "model")
      .not("settled_at", "is", null)
      .not("finish_position", "is", null)
      .order("date")
      .order("published_at")
      .order("id")
      .range(from, from + 999);
    if (error) return new Response(`error: ${error.message}\n`, { status: 500, headers: { "cache-control": "no-store" } });
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return new Response([HEAD.join(","), ...rows.map(line)].join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
