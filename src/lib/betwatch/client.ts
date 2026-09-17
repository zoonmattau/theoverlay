import "server-only";

/**
 * BetWatch: live bookmaker prices and the Betfair exchange (best back and
 * lay with the money waiting at each) for every Australian race, a GraphQL
 * endpoint keyed by BETWATCH_API_KEY. A race call takes three to four
 * seconds, so prices are polled in the background and kept in the store,
 * never fetched on a page view.
 */
const URL = "https://api.betwatch.com/query";
const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
/** The bookmakers asked for, by BetWatch's names, and our code for each. */
export const BOOKMAKERS: Record<string, string> = {
  Sportsbet: "sportsbet",
  Tab: "tab",
  Ladbrokes: "ladbrokes",
  Neds: "neds",
  Bet365: "bet365",
  Pointsbet: "pointsbet",
  Betr: "betr",
  Unibet: "unibet",
  Tabtouch: "tabtouch",
  Dabble: "dabble",
  Palmerbet: "palmerbet",
  Betright: "betright",
  Bluebet: "bluebet",
};

export const betwatchConfigured = () => Boolean(process.env.BETWATCH_API_KEY);

async function query<T>(q: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": process.env.BETWATCH_API_KEY ?? "" },
    body: JSON.stringify({ query: q, variables }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`BetWatch ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  // A runner without an exchange market is reported as an error beside the data; only an empty answer is a failure.
  if (!json.data) throw new Error(`BetWatch: ${json.errors?.[0]?.message ?? "no data"}`);
  return json.data;
}

export interface BetwatchRace {
  id: string;
  number: number;
  status: string;
  /** ISO, UTC. */
  startTime: string;
  meeting: { track: string; location: string; date: string };
  runners: { name: string; number: number; scratchedTime?: string | null }[];
}

/** Every Australian thoroughbred race BetWatch lists on a date (its date, which straddles ours; ask for the day either side). */
export async function betwatchRaces(from: string, to: string): Promise<BetwatchRace[]> {
  const d = await query<{ races: BetwatchRace[] | null }>(
    `query($f:String,$t:String,$types:[RaceType!],$loc:[String!]){ races(dateFrom:$f,dateTo:$t,types:$types,locations:$loc){ id number status startTime meeting{ track location date } runners{ name number scratchedTime } } }`,
    { f: from, t: to, types: ["Thoroughbred"], loc: STATES },
  );
  return d.races ?? [];
}

export interface BetwatchMarket {
  number: number;
  name: string;
  scratched: boolean;
  /** Betfair's starting price, once the race has run. */
  bsp?: number;
  /** Each bookmaker's fixed win price now, by our code. */
  bookies: Record<string, { price: number; at?: string }>;
  exchange?: { back?: number; backSize?: number; lay?: number; laySize?: number; matched?: number };
}

interface RawRunner {
  id: string;
  name: string;
  number: number;
  scratchedTime?: string | null;
  bookmakerMarkets?: { bookmaker: string; fixedWin?: { price?: number | null; lastUpdated?: string | null } | null }[] | null;
  betfairMarkets?: { marketName?: string | null; back?: { price?: number; size?: number }[] | { price?: number; size?: number } | null; lay?: { price?: number; size?: number }[] | { price?: number; size?: number } | null; totalMatched?: number | null; sp?: number | null }[] | null;
}

const first = <T>(x: T[] | T | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : (x ?? undefined));

/**
 * One race's markets now: every bookmaker's win price and the exchange's
 * best back and lay; once it has run, the placings (tab numbers by
 * position, a dead heat sharing one) and Betfair's starting prices.
 */
export async function betwatchMarkets(id: string): Promise<{ status: string; results?: number[][]; runners: BetwatchMarket[] }> {
  const d = await query<{ race: { status: string; results?: number[][] | null; runners: RawRunner[] } | null }>(
    `query($id:ID!,$b:[String!]){ race(id:$id){ status results runners{ id name number scratchedTime bookmakerMarkets(bookmakers:$b){ bookmaker fixedWin{ price lastUpdated } } betfairMarkets{ marketName back{ price size } lay{ price size } totalMatched sp } } } }`,
    { id, b: Object.keys(BOOKMAKERS) },
  );
  if (!d.race) throw new Error(`BetWatch: race ${id} missing`);
  const runners = d.race.runners.map((r): BetwatchMarket => {
    const bookies: BetwatchMarket["bookies"] = {};
    for (const m of r.bookmakerMarkets ?? []) {
      const code = BOOKMAKERS[m.bookmaker];
      const p = m.fixedWin?.price;
      if (code && p && p > 1) bookies[code] = { price: p, at: m.fixedWin?.lastUpdated ?? undefined };
    }
    const win = (r.betfairMarkets ?? []).find((m) => (m.marketName ?? "").toLowerCase() === "win");
    const back = first(win?.back), lay = first(win?.lay);
    const exchange = win
      ? { back: back?.price, backSize: back?.size, lay: lay?.price, laySize: lay?.size, matched: win.totalMatched ?? undefined }
      : undefined;
    const bsp = win?.sp && win.sp > 1 ? Math.round(win.sp * 100) / 100 : undefined;
    return { number: r.number, name: r.name, scratched: Boolean(r.scratchedTime), bsp, bookies, exchange: exchange?.lay || exchange?.back ? exchange : undefined };
  });
  const results = d.race.results?.filter((p) => Array.isArray(p) && p.length > 0);
  return { status: d.race.status, results: results?.length ? results : undefined, runners };
}
