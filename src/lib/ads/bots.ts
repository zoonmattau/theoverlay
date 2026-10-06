/**
 * Meta's ad review fetches an ad's link the moment it is published or edited:
 * a burst of brand-new "visitors" on the same ad tag, seconds apart, each
 * loading one page and leaving (21 of them across the Real life ads on
 * 6 Oct 2026). A visitor is a bot when they land in a burst, three or more
 * new visitors on one tag inside a minute, and never load a second page.
 * Real people from an ad arrive spread out, and most click on.
 */
export const BURST_MS = 60_000;
export const BURST_SIZE = 3;

export function reviewBots(landings: { vid: string; tag: string; at: number }[], pagesBy: Map<string, number>): Set<string> {
  const bots = new Set<string>();
  const byTag = new Map<string, { vid: string; at: number }[]>();
  for (const l of landings) byTag.set(l.tag, [...(byTag.get(l.tag) ?? []), { vid: l.vid, at: l.at }]);
  for (const list of byTag.values()) {
    list.sort((a, b) => a.at - b.at);
    for (let i = 0; i < list.length; i++) {
      // Everyone within a minute either side of this landing, on the same ad.
      const near = list.filter((x) => Math.abs(x.at - list[i].at) <= BURST_MS);
      if (near.length >= BURST_SIZE && (pagesBy.get(list[i].vid) ?? 1) <= 1) bots.add(list[i].vid);
    }
  }
  return bots;
}
