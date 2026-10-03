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
  /** BetWatch's start time, ISO: a race put back moves with it, where Form King's stays as bought. */
  startTime?: string;
  runners: Record<string, LivePrice>;
  /** Once run: tab numbers by finishing position (a dead heat shares one) and Betfair's win and place starting prices by tab. */
  result?: { placings: number[][]; bsp: Record<string, number>; bspPlace?: Record<string, number>; at: string };
}

export interface PriceBook {
  /** BetWatch's id for each of our races, found once. */
  ids: Record<string, string>;
  /** Our races BetWatch did not list when last looked for. */
  missing: string[];
  /** When the missing were last looked for; they are tried again after MISSING_RETRY_MS. */
  missingAt?: string;
  races: Record<string, RacePrices>;
  polledAt?: string;
}

const KIND = "bw";
/**
 * How often a race is polled by how far off it is: every PRICE_FAR_EVERY_MS
 * until the window opens, every PRICE_EVERY_MS inside it, and every
 * PRICE_NEAR_EVERY_MS in the last minutes, when the exchange fills and the
 * bookmakers move most.
 */
export const PRICE_WINDOW_MS = Number(process.env.OVERLAY_PRICE_WINDOW_MIN ?? 120) * 60_000;
export const PRICE_EVERY_MS = Number(process.env.OVERLAY_PRICE_EVERY_SEC ?? 300) * 1000;
export const PRICE_FAR_EVERY_MS = Number(process.env.OVERLAY_PRICE_FAR_MIN ?? 30) * 60_000;
export const PRICE_NEAR_MS = Number(process.env.OVERLAY_PRICE_NEAR_MIN ?? 5) * 60_000;
export const PRICE_NEAR_EVERY_MS = Number(process.env.OVERLAY_PRICE_NEAR_EVERY_SEC ?? 60) * 1000;
/** How long after the jump a result is waited for. */
const RESULT_WINDOW_MS = 4 * 60 * 60_000;
/** For this long after the jump the result is asked for every minute; after that every five, until the window closes. */
export const RESULT_NEAR_MS = Number(process.env.OVERLAY_RESULT_NEAR_MIN ?? 20) * 60_000;
export const RESULT_NEAR_EVERY_MS = Number(process.env.OVERLAY_RESULT_NEAR_EVERY_SEC ?? 60) * 1000;
/** Races fetched at once; each takes a few seconds. */
const IN_FLIGHT = 6;
const DEAD_BOOK_MS = 3 * 60 * 60_000;
/**
 * How long a race BetWatch did not list stays unlooked-for. A meeting can
 * be on the list before its fields are, and the name check then fails:
 * Emerald's seven races missed the morning lookup on 22 Sep 2026 and were
 * never tried again, so its results came from the feed's slow poll.
 */
const MISSING_RETRY_MS = 20 * 60_000;

const empty = (): PriceBook => ({ ids: {}, missing: [], races: {} });

/** The day's book, empty when none has been written; a store that does not answer throws rather than pass for an empty book. */
export async function readPriceBook(date: string): Promise<PriceBook> {
  const { data, error } = await supabaseAdmin().from("fk_cache").select("data").eq("key", `${KIND}:${date}`).maybeSingle();
  if (error) throw new Error(`[betwatch] read book ${date}: ${error.message}`);
  return (data?.data as PriceBook | undefined) ?? empty();
}

/**
 * Two pollers share the book, the minute cron and a page view's refresh, and
 * each spends seconds fetching between its read and its write. Written whole,
 * the later write wiped what the other had added: on 1 Oct 2026 four races
 * lost the results BetWatch had given them, and the starting prices with them.
 * So a write merges into the book as it stands now: each race keeps its newer
 * poll, a result once seen is never dropped, and its starting prices only gather.
 */
export async function writePriceBook(date: string, book: PriceBook): Promise<void> {
  let merged = book;
  try {
    merged = mergeBooks(await readPriceBook(date), book);
  } catch (err) {
    console.error("[betwatch] merge", err instanceof Error ? err.message : err);
  }
  const { error } = await supabaseAdmin().from("fk_cache").upsert({ key: `${KIND}:${date}`, kind: KIND, data: merged as never, at: new Date().toISOString() }, { onConflict: "key" });
  if (error) console.error("[betwatch] write", error.message);
}

const later = (a?: string, b?: string) => (!a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b);

function mergeResult(a?: RacePrices["result"], b?: RacePrices["result"]): RacePrices["result"] {
  if (!a || !b) return a ?? b;
  const [old, recent] = Date.parse(a.at) > Date.parse(b.at) ? [b, a] : [a, b];
  return { ...recent, bsp: { ...old.bsp, ...recent.bsp }, bspPlace: { ...old.bspPlace, ...recent.bspPlace } };
}

/** `ours` laid over what the store holds now, race by race. */
export function mergeBooks(stored: PriceBook, ours: PriceBook): PriceBook {
  const races: Record<string, RacePrices> = { ...stored.races };
  for (const [raceId, mine] of Object.entries(ours.races)) {
    const theirs = races[raceId];
    if (!theirs) {
      races[raceId] = mine;
      continue;
    }
    const newer = Date.parse(mine.at) >= Date.parse(theirs.at) ? mine : theirs;
    races[raceId] = { ...newer, result: mergeResult(theirs.result, mine.result) };
  }
  const ids = { ...stored.ids, ...ours.ids };
  const missingAt = later(stored.missingAt, ours.missingAt);
  const missing = (missingAt === ours.missingAt ? ours.missing : stored.missing).filter((id) => !ids[id]);
  return { ...stored, ...ours, ids, missing, missingAt, polledAt: later(stored.polledAt, ours.polledAt), races };
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
export function matchRace(meeting: PublishedMeeting, race: PublishedMeeting["races"][number], list: BetwatchRace[], otherTracks: Set<string> = new Set()): BetwatchRace | undefined {
  const jump = race.jumpTime ? Date.parse(race.jumpTime) : undefined;
  const names = new Set(race.runners.map((r) => nameKey(r.horseName)));
  // A market belonging to another meeting on our card by name is that meeting's, whatever the runners say.
  // Cranbourne moved to the Pakenham synthetic on 2 Oct 2026 with the same fields: Pakenham took
  // Cranbourne's closed markets and every race read as abandoned.
  const candidates = list.filter(
    (b) =>
      b.number === race.raceNumber &&
      b.meeting.location === meeting.state &&
      (!jump || Math.abs(Date.parse(b.startTime) - jump) < 90 * 60_000) &&
      (norm(b.meeting.track) === norm(meeting.track) || !otherTracks.has(norm(b.meeting.track))),
  );
  const scored = candidates
    .map((b) => {
      const shared = b.runners.filter((r) => names.has(nameKey(r.name))).length;
      return { b, shared, track: norm(b.meeting.track) === norm(meeting.track) };
    })
    .filter((c) => c.shared * 2 >= Math.min(names.size, c.b.runners.length) || (c.track && c.shared > 0))
    .sort((x, y) => y.shared - x.shared || Number(y.track) - Number(x.track));
  return scored[0]?.b;
}

/**
 * The races on a card not yet run: inside the window before the jump, or
 * with `far` every race still to come today, each with how often it is due.
 */
export function racesToPrice(meetings: PublishedMeeting[], now = Date.now(), far = false): { meeting: PublishedMeeting; race: PublishedMeeting["races"][number]; every: number }[] {
  const out: { meeting: PublishedMeeting; race: PublishedMeeting["races"][number]; every: number }[] = [];
  for (const meeting of meetings) {
    for (const race of meeting.races) {
      if (race.result?.length || !race.jumpTime) continue;
      const until = Date.parse(race.jumpTime) - now;
      // A minute past the listed jump: the field is often late out, and the last look is the one that matters.
      if (until < -60_000) continue;
      if (until > PRICE_WINDOW_MS) {
        if (!far) continue;
        out.push({ meeting, race, every: PRICE_FAR_EVERY_MS });
      } else out.push({ meeting, race, every: until <= PRICE_NEAR_MS ? PRICE_NEAR_EVERY_MS : PRICE_EVERY_MS });
    }
  }
  return out;
}

/** BetWatch's own word that a result is final: "Resulted", not "Interim results". */
export const isFinal = (status?: string) => Boolean(status && /resulted/i.test(status) && !/interim/i.test(status));

/**
 * BetWatch's placings laid over the card: BetWatch is the word on every
 * placing after a race. Where it has a result and the card disagrees (an
 * interim result, then a protest upheld; or the feed's order), the card
 * takes BetWatch's, and the Form King extras (margins, dividends) stay only
 * where they agree with it. Each horse keeps its own starting price. Returns
 * the races it changed.
 */
export function applyBookResults(meetings: PublishedMeeting[], book: PriceBook): string[] {
  const changed: string[] = [];
  for (const m of meetings) {
    for (const race of m.races) {
      const live = book.races[race.raceId];
      if (race.abandoned || !live?.result?.placings?.length) continue;
      const position = new Map<number, number>();
      live.result.placings.forEach((tabs, i) => tabs.forEach((t) => position.set(t, i + 1)));
      const order = [...position.entries()].sort((a, b) => a[1] - b[1]).map(([tab]) => tab);
      if (order.length === 0) continue;
      // BetWatch places the first few; a horse outside them keeps the feed's finishing spot, if it has one past them.
      const deepest = Math.max(...position.values());
      const finishOf = (x: PublishedMeeting["races"][number]["runners"][number]) =>
        position.get(x.tabNumber) ?? (x.finishPosition && x.finishPosition > deepest ? x.finishPosition : 0);
      const same = (race.result ?? []).slice(0, 4).join(",") === order.slice(0, 4).join(",") && race.runners.every((x) => x.scratched || x.finishPosition === finishOf(x));
      if (same) {
        // The orders agree, but the feed's official result can come with no
        // dividends at all, only the SP, and it replaces the placings BetWatch
        // had priced: Bodmin Moor, Gold Coast R1, 3 Oct 2026, went from its
        // $17.56 BSP to the $10 SP. BetWatch's prices fill what the feed left out.
        let filled = false;
        for (const p of race.placings ?? []) {
          const bsp = live.result.bsp[String(p.tabNumber)];
          const bspPlace = p.position <= 3 ? live.result.bspPlace?.[String(p.tabNumber)] : undefined;
          if (bsp && !p.bsp) {
            p.bsp = bsp;
            filled = true;
          }
          if (bspPlace && !p.bspPlace) {
            p.bspPlace = bspPlace;
            filled = true;
          }
        }
        if (filled) changed.push(race.raceId);
        continue;
      }
      const was = new Map((race.placings ?? []).map((p) => [p.tabNumber, p] as const));
      const sameOrder = (race.result ?? []).slice(0, 4).join(",") === order.slice(0, 4).join(",");
      race.result = order.slice(0, 4);
      race.placings = order.slice(0, 4).map((tab) => {
        const old = was.get(tab);
        const pos = position.get(tab)!;
        return {
          ...(sameOrder ? old : { sp: old?.sp }),
          position: pos,
          tabNumber: tab,
          jump: old?.jump ?? race.runners.find((x) => x.tabNumber === tab)?.marketPrice,
          bsp: live.result!.bsp[String(tab)] || old?.bsp || undefined,
          bspPlace: pos <= 3 ? live.result!.bspPlace?.[String(tab)] || old?.bspPlace || undefined : undefined,
        };
      });
      for (const x of race.runners) {
        if (live.runners?.[String(x.tabNumber)]?.scratched) x.scratched = true;
        x.finishPosition = x.scratched ? undefined : finishOf(x);
      }
      changed.push(race.raceId);
    }
  }
  return changed;
}

/**
 * The races on a card that have jumped and have no result yet, each with
 * how often its result is asked for: every minute while the result is
 * expected, every five once it is overdue. A race resulted without its
 * prices (the win and the first three's place) is asked again every five
 * minutes: Betfair's starting prices can post after the placings, and with
 * no Form King result they are the only ones it gets (1 Oct 2026).
 */
export function racesToSettle(meetings: PublishedMeeting[], now = Date.now(), book?: PriceBook): { meeting: PublishedMeeting; race: PublishedMeeting["races"][number]; every: number }[] {
  const out: { meeting: PublishedMeeting; race: PublishedMeeting["races"][number]; every: number }[] = [];
  for (const meeting of meetings) {
    for (const race of meeting.races) {
      if (!race.jumpTime || race.abandoned) continue;
      const priced = Boolean(race.placings?.[0]?.win) && (race.placings ?? []).slice(0, 3).every((p) => p.place);
      // BetWatch decides the placings: an interim result is asked after until BetWatch calls it final,
      // so a protest upheld after the interim lands (Randwick R1, 3 Oct 2026). Without the book, as before.
      const waiting = book ? !isFinal(book.races[race.raceId]?.status) : false;
      if (race.result?.length && priced && !waiting) continue;
      const since = now - Date.parse(race.jumpTime);
      if (since < 60_000 || since > RESULT_WINDOW_MS) continue;
      out.push({ meeting, race, every: !race.result?.length && since <= RESULT_NEAR_MS ? RESULT_NEAR_EVERY_MS : PRICE_EVERY_MS });
    }
  }
  return out;
}

/**
 * One round: every race due whose prices are older than its interval is
 * fetched (inside the window, or with `far` every race still to run), every
 * race run and unresulted is asked for its result, and the book written.
 * Returns how many races were refreshed; the caller rebuilds the card when
 * that is more than none.
 */
export async function pollPrices(date: string, meetings: PublishedMeeting[], opts: { far?: boolean } = {}): Promise<number> {
  if (!betwatchConfigured()) return 0;
  const now = Date.now();
  let due = [...racesToPrice(meetings, now, opts.far), ...racesToSettle(meetings, now)];
  // A race resulted inside the window may still be waiting on BetWatch's final word.
  const resulted = meetings.some((m) => m.races.some((r) => r.result?.length && r.jumpTime && now - Date.parse(r.jumpTime) <= RESULT_WINDOW_MS));
  if (due.length === 0 && !resulted) return 0;
  const book = await readPriceBook(date);
  due = [...racesToPrice(meetings, now, opts.far), ...racesToSettle(meetings, now, book)];
  if (due.length === 0) return 0;
  // A result already in the book and not yet on the card is only waiting for the card to be rebuilt.
  // A race on the card with a result is still due when it waits on place prices, and counting it here
  // stopped every poll for the night (Pakenham R3, 2 Oct 2026).
  if (due.some(({ race }) => !race.result?.length && book.races[race.raceId]?.result)) return 1;
  // Whoever polled inside the shortest interval due has this round.
  const soonest = Math.min(...due.map((d) => d.every));
  if (book.polledAt && now - Date.parse(book.polledAt) < soonest * 0.8) return 0;
  book.polledAt = new Date(now).toISOString();
  await writePriceBook(date, book);

  // A market linked to two of our races is in dispute: both lose the link and are matched
  // again below, under the rule that keeps a market with its own meeting. Undoes what an
  // older deploy's matcher wrote (Pakenham onto Cranbourne, 2 Oct 2026).
  const claims = new Map<string, string[]>();
  for (const [raceId, id] of Object.entries(book.ids)) claims.set(id, [...(claims.get(id) ?? []), raceId]);
  for (const ids of claims.values()) if (ids.length > 1) for (const raceId of ids) {
    delete book.ids[raceId];
    delete book.races[raceId];
  }

  // Races not yet matched to BetWatch's list, looked up in one call; the
  // missing are looked for again once the retry wait has passed.
  const retry = !book.missingAt || now - Date.parse(book.missingAt) >= MISSING_RETRY_MS;
  const unmatched = due.filter(({ race }) => !book.ids[race.raceId] && (retry || !book.missing.includes(race.raceId)));
  if (unmatched.length > 0) {
    try {
      const list = await betwatchRaces(dayAfter(date, -1), dayAfter(date, 1));
      const still = new Set(book.missing.filter((id) => !unmatched.some((u) => u.race.raceId === id)));
      const onCard = new Set(meetings.map((m) => norm(m.track)));
      for (const { meeting, race } of unmatched) {
        const others = new Set([...onCard].filter((t) => t !== norm(meeting.track)));
        const hit = matchRace(meeting, race, list, others);
        if (hit) book.ids[race.raceId] = hit.id;
        else still.add(race.raceId);
      }
      book.missing = [...still];
      book.missingAt = new Date(now).toISOString();
    } catch (err) {
      console.error("[betwatch] races", err instanceof Error ? err.message : err);
    }
  }

  const stale = due.filter(({ race, every }) => book.ids[race.raceId] && now - Date.parse(book.races[race.raceId]?.at ?? "1970-01-01") >= every * 0.8);
  let refreshed = 0;
  for (let i = 0; i < stale.length; i += IN_FLIGHT) {
    await Promise.all(
      stale.slice(i, i + IN_FLIGHT).map(async ({ race }) => {
        try {
          const m = await betwatchMarkets(book.ids[race.raceId]);
          const runners: Record<string, LivePrice> = {};
          // A quote's time is when the book last moved it, so an old quote on one runner is often a
          // price nobody needed to move. A book that has moved nothing in the race for hours while the
          // others trade is a dead feed instead: Sportsbet on 23 Sep 2026, every quote from the day
          // before ($13 on a $4.50 horse). That book is left out of the race.
          const quotedAt = (b: { at?: string }) => (b.at ? Date.parse(b.at) || 0 : 0);
          const bookMoved: Record<string, number> = {};
          for (const r of m.runners) if (!r.scratched) for (const [code, b] of Object.entries(r.bookies)) bookMoved[code] = Math.max(bookMoved[code] ?? 0, quotedAt(b));
          const raceMoved = Math.max(0, ...Object.values(bookMoved));
          const dead = new Set(Object.keys(bookMoved).filter((code) => bookMoved[code] && raceMoved - bookMoved[code] > DEAD_BOOK_MS));
          for (const r of m.runners) {
            const live = Object.entries(r.bookies).filter(([code]) => !dead.has(code));
            const prices = live.map(([, b]) => b.price);
            const best = prices.length ? Math.max(...prices) : undefined;
            runners[String(r.number)] = {
              best,
              bookies: best ? live.filter(([, b]) => b.price === best).map(([code]) => code) : undefined,
              avg: prices.length ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : undefined,
              back: r.exchange?.back,
              backSize: r.exchange?.backSize,
              lay: r.exchange?.lay,
              laySize: r.exchange?.laySize,
              matched: r.exchange?.matched,
              scratched: r.scratched || undefined,
            };
          }
          const entry: RacePrices = { betwatchId: book.ids[race.raceId], at: new Date().toISOString(), status: m.status, startTime: m.startTime, runners };
          // The interim result, with the placings and BSP, comes about five
          // minutes after the jump; "Resulted" waits on correct weight, nine
          // to sixteen (22 Sep 2026). The interim settles, and a placing the
          // official result moves settles again, see recordTips.
          if (/resulted|interim/i.test(m.status) && m.results) {
            const bsp: Record<string, number> = {};
            const bspPlace: Record<string, number> = {};
            for (const r of m.runners) {
              if (r.bsp) bsp[String(r.number)] = r.bsp;
              if (r.bspPlace) bspPlace[String(r.number)] = r.bspPlace;
            }
            entry.result = { placings: m.results, bsp, bspPlace, at: entry.at };
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
