/**
 * The bookmakers Form King names as holding the best price, in the order we
 * would rather send someone: the ones most punters already hold an account
 * with first. A code Form King sends that is not here still gets a name.
 *
 * Links come from NEXT_PUBLIC_BOOKIE_LINKS, a JSON object of code to URL,
 * so an affiliate link replaces the plain home page without a code change.
 */
const KNOWN: { code: string; name: string; home: string }[] = [
  { code: "sportsbet", name: "Sportsbet", home: "https://www.sportsbet.com.au" },
  { code: "tab", name: "TAB", home: "https://www.tab.com.au" },
  { code: "ladbrokes", name: "Ladbrokes", home: "https://www.ladbrokes.com.au" },
  { code: "neds", name: "Neds", home: "https://www.neds.com.au" },
  { code: "bet365", name: "bet365", home: "https://www.bet365.com.au" },
  { code: "pointsbet", name: "PointsBet", home: "https://pointsbet.com.au" },
  { code: "betr", name: "betr", home: "https://www.betr.com.au" },
  { code: "unibet", name: "Unibet", home: "https://www.unibet.com.au" },
  { code: "dabble", name: "Dabble", home: "https://dabble.com.au" },
  { code: "tabtouch", name: "TABtouch", home: "https://www.tabtouch.com.au" },
  { code: "palmerbet", name: "Palmerbet", home: "https://www.palmerbet.com" },
  { code: "betright", name: "BetRight", home: "https://www.betright.com.au" },
  { code: "bluebet", name: "BlueBet", home: "https://www.bluebet.com.au" },
  { code: "picklebet", name: "Picklebet", home: "https://picklebet.com" },
  { code: "betdeluxe", name: "BetDeluxe", home: "https://www.betdeluxe.com.au" },
  { code: "elitebet", name: "Elitebet", home: "https://www.elitebet.com.au" },
  { code: "colossalbet", name: "Colossalbet", home: "https://www.colossalbet.com.au" },
  { code: "betnation", name: "BetNation", home: "https://www.betnation.com.au" },
  { code: "swiftbet", name: "Swiftbet", home: "https://www.swiftbet.com.au" },
  { code: "readybet", name: "ReadyBet", home: "https://www.readybet.com.au" },
  { code: "fatbet", name: "Fatbet", home: "https://www.fatbet.com.au" },
  { code: "betchamps", name: "BetChamps", home: "https://www.betchamps.com.au" },
  { code: "chasebet", name: "Chasebet", home: "https://www.chasebet.com.au" },
  { code: "vicbet", name: "Vicbet", home: "https://www.vicbet.com.au" },
  { code: "robwaterhouse", name: "Rob Waterhouse", home: "https://www.robwaterhouse.com" },
];

const RANK = new Map(KNOWN.map((b, i) => [b.code, i]));
/** Bookies an Australian punter cannot use. */
const SKIP = new Set(["tab nz"]);

function links(): Record<string, string> {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_BOOKIE_LINKS ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export interface Bookie {
  code: string;
  name: string;
  url: string;
}

/** The bookie to send someone to for a price, from the codes Form King says hold it. */
export function bestBookie(codes?: string[]): Bookie | undefined {
  const usable = (codes ?? []).filter((c) => !SKIP.has(c));
  if (usable.length === 0) return undefined;
  const code = usable.sort((a, b) => (RANK.get(a) ?? 999) - (RANK.get(b) ?? 999))[0];
  const known = KNOWN.find((b) => b.code === code);
  const name = known?.name ?? code.replace(/\b\w/g, (c) => c.toUpperCase());
  const url = links()[code] ?? known?.home ?? `https://www.google.com/search?q=${encodeURIComponent(name)}`;
  return { code, name, url };
}
