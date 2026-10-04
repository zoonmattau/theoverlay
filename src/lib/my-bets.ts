import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import { readStoredCard } from "@/lib/model/store";

/**
 * Your own bets, kept beside the calls: each is matched to a runner on our
 * stored card for its date, and settled from that race's result as soon as it
 * is in, so nothing is typed twice. Win pays at the price taken; place pays
 * the place price entered, top three with eight or more runners, top two with
 * five to seven, none under five; a lay wins the backer's stake when the
 * runner loses and pays the liability when it wins (no commission taken off).
 * A scratching is void. Results can be interim for a while after the jump, so
 * a bet keeps re-settling for three days.
 */
export type BetKind = "win" | "place" | "lay";

export interface MyBet {
  id: string;
  date: string;
  race_id: string;
  meeting_id: string | null;
  track: string | null;
  race_number: number | null;
  horse: string;
  tab_number: number | null;
  kind: BetKind;
  stake_cents: number;
  odds: number;
  account: string | null;
  note: string | null;
  finish_position: number | null;
  result: "won" | "lost" | "void" | null;
  profit_cents: number | null;
  settled_at: string | null;
}

type Card = NonNullable<Awaited<ReturnType<typeof readStoredCard>>>["card"];
type Race = Card["meetings"][number]["races"][number];
type Runner = Race["runners"][number];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The runners on a date whose name matches, with their race. */
export async function findRunner(date: string, horse: string): Promise<{ race: Race; runner: Runner; track: string; meetingId: string }[]> {
  const stored = await readStoredCard(date);
  if (!stored) return [];
  const want = norm(horse);
  const out: { race: Race; runner: Runner; track: string; meetingId: string }[] = [];
  for (const m of stored.card.meetings) {
    for (const race of m.races) {
      for (const runner of race.runners) {
        const name = norm(runner.horseName ?? "");
        if (name === want || (want.length >= 5 && name.startsWith(want))) out.push({ race, runner, track: m.track, meetingId: m.meetingId });
      }
    }
  }
  return out;
}

/** The result of one bet from its race, or undefined while the race has no result. */
function settle(bet: MyBet, race: Race): Pick<MyBet, "finish_position" | "result" | "profit_cents"> | undefined {
  const runner = race.runners.find((r) => r.tabNumber === bet.tab_number) ?? race.runners.find((r) => norm(r.horseName ?? "") === norm(bet.horse));
  if (!runner) return undefined;
  if (runner.scratched) return { finish_position: null, result: "void", profit_cents: 0 };
  const pos = runner.finishPosition;
  if (!pos) return undefined;
  const stake = bet.stake_cents;
  const field = race.runners.filter((r) => !r.scratched).length;
  if (bet.kind === "win") return pos === 1 ? { finish_position: pos, result: "won", profit_cents: Math.round(stake * (bet.odds - 1)) } : { finish_position: pos, result: "lost", profit_cents: -stake };
  if (bet.kind === "place") {
    const places = field >= 8 ? 3 : field >= 5 ? 2 : 0;
    if (places === 0) return { finish_position: pos, result: "void", profit_cents: 0 };
    return pos <= places ? { finish_position: pos, result: "won", profit_cents: Math.round(stake * (bet.odds - 1)) } : { finish_position: pos, result: "lost", profit_cents: -stake };
  }
  // A lay: the stake is the backer's stake you accept.
  return pos === 1 ? { finish_position: pos, result: "lost", profit_cents: -Math.round(stake * (bet.odds - 1)) } : { finish_position: pos, result: "won", profit_cents: stake };
}

/** This user's bets, newest first, settling any whose race is in (and re-settling the last three days). */
export async function myBets(userId: string): Promise<MyBet[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("personal_bets").select("*").eq("user_id", userId).order("date", { ascending: false }).order("created_at", { ascending: false });
  if (error) return [];
  const bets = (data ?? []).map((b) => ({ ...b, odds: Number(b.odds) })) as MyBet[];
  const recent = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
  const open = bets.filter((b) => !b.settled_at || b.date >= recent);
  const cards = new Map<string, Card | undefined>();
  for (const b of open) {
    if (!cards.has(b.date)) cards.set(b.date, (await readStoredCard(b.date).catch(() => undefined))?.card);
    const race = cards.get(b.date)?.meetings.flatMap((m) => m.races).find((r) => r.raceId === b.race_id);
    const s = race && settle(b, race);
    if (!s || (s.result === b.result && s.profit_cents === b.profit_cents && s.finish_position === b.finish_position)) continue;
    await db.from("personal_bets").update({ ...s, settled_at: new Date().toISOString() }).eq("id", b.id);
    Object.assign(b, s, { settled_at: new Date().toISOString() });
  }
  return bets;
}
