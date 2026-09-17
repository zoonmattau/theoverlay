import "server-only";

import { supabaseAdmin } from "@/lib/billing/access";
import { trackKey } from "@/lib/data/people";
import type { PublishedMeeting } from "@/lib/model/types";

import { betwatchConfigured, betwatchMarkets, betwatchRaces, type BetwatchRace } from "./client";

/**
 * The price book: what BetWatch last saw for each race on a card, kept in
 * fk_cache under bw:<date>. The card build reads it and takes any price
 * fresher than Form King's; the poll writes it for every race inside the
 * window before its jump.
 */
export interface LivePrice {
  /** Best fixed win price across the bookmakers, and who holds it. */
  best?: number;
  bookies?: string[];
  avg?: number;
  /** The exchange: the best back and lay on offer and the money waiting at each. */
  back?: number;
  backSize?: number;
  lay?: number;
  laySize?: number;
  matched?: number;
  scratched?: boolean;
}

export interface RacePrices {
  betwatchId: string;
  /** ISO, when these were fetched. */
  at: string;
  status?: string;
  runners: Record<string, LivePrice>;
  /** Once run: tab numbers by finishing position (a dead heat shares one) and Betfair's starting price by tab. */
  result?: { placings: number[][]; bsp: Record<string, number>; at: string };
}

export interface PriceBook {
  /** BetWatch's id for each of our races, found once. */
  ids: Record<string, string>;
  /** Our races BetWatch does not list, so they are not looked for again. */
  missing: string[];
  races: Record<string, RacePrices>;
  polledAt?: string;
}

const KIND = "bw";
/** How long before the jump prices start being polled, and how often. */
export const PRICE_WINDOW_MS = Number(process.env.OVERLAY_PRICE_WINDOW_MIN ?? 120) * 60_000;
export const PRICE_EVERY_MS = Number(process.env.OVERLAY_PRICE_EVERY_SEC ?? 300) * 1000;
/** How long after the jump a result is waited for. */
const RESULT_WINDOW_MS = 4 * 60 * 60_000;
/** Races fetched at once; each takes a few seconds. */
const IN_FLIGHT = 6;

const empty = (): PriceBook => ({ ids: {}, missing: [], races: {} });

export async function readPriceBook(date: string): Promise<PriceBook> {
  const { data } = await supabaseAdmin().from("fk_cache").select("data").eq("key", `${KIND}:${date}`).maybeSingle();
  return (data?.data as PriceBook | undefined) ?? empty();
}

async function writePriceBook(date: string, book: PriceBook): Promise<void> {
  const { error } = await supabaseAdmin().from("fk_cache").upsert({ key: `${KIND}:${date}`, kind: KIND, data: book as never, at: new Date().toISOString() }, { onConflict: "key" });
  if (error) console.error("[betwatch] write", error.message);
}

const norm = (s: string) => (trackKey(s) ?? s).toLowerCase().replace(/[^a-z]/g, "");
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const dayAfter = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Our race in BetWatch's list: same state and race number, off within an
 * hour and a half of our jump time, and at least half the field by name,
 * which settles a track the two feeds name differently (Kembla Grange is
 * Illawarra Grange there).
 */
function matchRace(meeting: PublishedMeeting, race: PublishedMeeting["races"][number], list: BetwatchRace[]): BetwatchRace | undefined {
  const jump = race.jumpTime ? Date.parse(race.jumpTime) : undefined;
  const names = new Set(race.runners.map((r) => nameKey(r.horseName)));
  const candidates = list.filter((b) => b.number === race.raceNumber && b.meeting.location === meeting.state && (!jump || Math.abs(Date.parse(b.startTime) - jump) < 90 * 60_000));
  const scored = candidates
    .map((b) => {
      const shared = b.runners.filter((r) => names.has(nameKey(r.name))).length;
      return { b, shared, track: norm(b.meeting.track) === norm(meeting.track) };
    })
    .filter((c) => c.shared * 2 >= Math.min(names.size, c.b.runners.length) || (c.track && c.shared > 0))
    .sort((x, y) => y.shared - x.shared || Number(y.track) - Number(x.track));
  return scored[0]?.b;
}

/** The races on a card with a jump inside the window and not yet run. */
export function racesToPrice(meetings: PublishedMeeting[], now = Date.now()): { meeting: PublishedMeeting; race: PublishedMeeting["races"][number] }[] {
  const out: { meeting: PublishedMeeting; race: PublishedMeeting["races"][number] }[] = [];
  for (const meeting of meetings) {
    for (const race of meeting.races) {
      if (race.result?.length || !race.jumpTime) continue;
      const until = Date.parse(race.jumpTime) - now;
      // A minute past the listed jump: the field is often late out, and the last look is the one that matters.
      if (until < -60_000 || until > PRICE_WINDOW_MS) continue;
      out.push({ meeting, race });
    }
  }
  return out;
}

/** The races on a card that have jumped and have no result yet. */
export function racesToSettle(meetings: PublishedMeeting[], now = Date.now()): { meeting: PublishedMeeting; race: PublishedMeeting["races"][number] }[] {
  const out: { meeting: PublishedMeeting; race: PublishedMeeting["races"][number] }[] = [];
  for (const meeting of meetings) {
    for (const race of meeting.races) {
      if (race.result?.length || !race.jumpTime) continue;
      const since = now - Date.parse(race.jumpTime);
      if (since < 60_000 || since > RESULT_WINDOW_MS) continue;
      out.push({ meeting, race });
    }
  }
  return out;
}

/**
 * One round: every race inside the window whose prices are older than the
 * poll interval is fetched, and every race run and unresulted is asked for
 * its result, and the book written. Returns how many races were refreshed;
 * the caller rebuilds the card when that is more than none.
 */
export async function pollPrices(date: string, meetings: PublishedMeeting[]): Promise<number> {
  if (!betwatchConfigured()) return 0;
  const now = Date.now();
  const due = [...racesToPrice(meetings, now), ...racesToSettle(meetings, now)];
  if (due.length === 0) return 0;
  const book = await readPriceBook(date);
  // A result already in the book is only waiting for the card to be rebuilt.
  if (due.some(({ race }) => book.races[race.raceId]?.result)) return 1;
  // Whoever polled inside the interval has this round.
  if (book.polledAt && now - Date.parse(book.polledAt) < PRICE_EVERY_MS * 0.8) return 0;
  book.polledAt = new Date(now).toISOString();
  await writePriceBook(date, book);

  // Races not yet matched to BetWatch's list, looked up in one call.
  const unmatched = due.filter(({ race }) => !book.ids[race.raceId] && !book.missing.includes(race.raceId));
  if (unmatched.length > 0) {
    try {
      const list = await betwatchRaces(dayAfter(date, -1), dayAfter(date, 1));
      for (const { meeting, race } of unmatched) {
        const hit = matchRace(meeting, race, list);
        if (hit) book.ids[race.raceId] = hit.id;
        else book.missing.push(race.raceId);
      }
    } catch (err) {
      console.error("[betwatch] races", err instanceof Error ? err.message : err);
    }
  }

  const stale = due.filter(({ race }) => book.ids[race.raceId] && now - Date.parse(book.races[race.raceId]?.at ?? "1970-01-01") >= PRICE_EVERY_MS * 0.8);
  let refreshed = 0;
  for (let i = 0; i < stale.length; i += IN_FLIGHT) {
    await Promise.all(
      stale.slice(i, i + IN_FLIGHT).map(async ({ race }) => {
        try {
          const m = await betwatchMarkets(book.ids[race.raceId]);
          const runners: Record<string, LivePrice> = {};
          for (const r of m.runners) {
            const prices = Object.values(r.bookies).map((b) => b.price);
            const best = prices.length ? Math.max(...prices) : undefined;
            runners[String(r.number)] = {
              best,
              bookies: best ? Object.entries(r.bookies).filter(([, b]) => b.price === best).map(([code]) => code) : undefined,
              avg: prices.length ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : undefined,
              back: r.exchange?.back,
              backSize: r.exchange?.backSize,
              lay: r.exchange?.lay,
              laySize: r.exchange?.laySize,
              matched: r.exchange?.matched,
              scratched: r.scratched || undefined,
            };
          }
          const entry: RacePrices = { betwatchId: book.ids[race.raceId], at: new Date().toISOString(), status: m.status, runners };
          if (/resulted/i.test(m.status) && m.results) {
            const bsp: Record<string, number> = {};
            for (const r of m.runners) if (r.bsp) bsp[String(r.number)] = r.bsp;
            entry.result = { placings: m.results, bsp, at: entry.at };
          }
          book.races[race.raceId] = entry;
          refreshed++;
        } catch (err) {
          console.error("[betwatch] race", race.raceId, err instanceof Error ? err.message : err);
        }
      }),
    );
  }
  await writePriceBook(date, book);
  return refreshed;
}
