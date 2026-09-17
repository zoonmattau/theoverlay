/**
 * How people and places are keyed so two sources agree. The feed writes
 * "Steven Parnham" and "Trent Busuttin & Natalie Young"; HorseEdge wrote
 * "S.D.Parnham (a1.5)" and "T.Busuttin & N.Young". First initial and
 * surname, lower case, joined with & for a partnership, is the same from
 * either: "s.parnham", "t.busuttin&n.young".
 */
export function personKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name
    .replace(/\(.*?\)/g, " ")
    .split(/\s*&\s*|\s+and\s+/i)
    .map((part) => {
      const tokens = part.replace(/[.,]+/g, " ").trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return "";
      if (tokens.length === 1) return tokens[0].toLowerCase();
      const surname = tokens[tokens.length - 1];
      // "Ms" and "Mrs" are titles, not first names.
      const first = tokens.find((t) => !/^(mr|mrs|ms|miss|dr)$/i.test(t)) ?? tokens[0];
      return `${first[0]}.${surname}`.toLowerCase();
    })
    .filter(Boolean);
  return parts.length ? parts.join("&") : null;
}

/** Sponsors and suffixes HorseEdge carried in a venue name; the feed does not. */
const SPONSORS = /^(apiam|sportsbet|bet365|ladbrokes|tab|tabtouch|betdeluxe|neds|unibet|betr|southside|magic millions|the|racing\.com|racing com|seppelt|carlton draught|xxxx|schweppes|coca cola|iga|bendigo bank|picklebet park|thomas farms rc)\s+/i;

/** Two names for one track, from either source, to the one the feed uses most. */
const ALIASES: Record<string, string> = {
  "valley": "Moonee Valley",
  "cannon park": "Cairns",
  "royal randwick": "Randwick",
  "randwick-kensington": "Kensington",
  "rosehill gardens": "Rosehill",
  "canterbury park": "Canterbury",
  "mount barker": "Mt Barker",
  "mount gambier": "Mt Gambier",
  "murray bridge gh": "Murray Bridge",
  "devonport": "Devonport Synthetic",
  "devonport tapeta synthetic": "Devonport Synthetic",
  "yarra valley": "Yarra Glen",
  "park hillside": "Sandown Hillside",
  "park lakeside": "Sandown Lakeside",
  "sandown-hillside": "Sandown Hillside",
  "sandown-lakeside": "Sandown Lakeside",
  "sandown": "Sandown Lakeside",
};

/** A venue name as the feed writes it, as near as the sponsors allow. */
export function trackKey(venue: string | null | undefined): string | null {
  if (!venue) return null;
  let v = venue.trim();
  for (let i = 0; i < 3; i++) v = v.replace(SPONSORS, "");
  v = v.replace(/\s+racecourse$/i, "").replace(/\s+/g, " ").trim();
  // A sponsor on its own, or "Synthetic" with the track lost, names nothing.
  if (!v || /^(sportsbet|synthetic|ladbrokes|tab)$/i.test(v)) return null;
  return ALIASES[v.toLowerCase()] ?? v;
}
