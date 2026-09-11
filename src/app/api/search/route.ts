import { NextResponse, type NextRequest } from "next/server";

import { getTodayCard } from "@/lib/model/source";

export interface SearchHit {
  name: string;
  tab: number;
  track: string;
  raceNumber: number;
  jump?: string;
  resulted: boolean;
  scratched: boolean;
  url: string;
}

/** Runners on today's card whose name contains the query, soonest race first. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const { date, meetings } = await getTodayCard();
  const hits: SearchHit[] = [];
  for (const m of meetings) {
    for (const r of m.races) {
      for (const x of r.runners) {
        if (!x.horseName.toLowerCase().includes(q)) continue;
        hits.push({
          name: x.horseName,
          tab: x.tabNumber,
          track: m.track,
          raceNumber: r.raceNumber,
          jump: r.jumpTime,
          resulted: Boolean(r.result),
          scratched: Boolean(x.scratched),
          url: `/racing/${date}/${encodeURIComponent(m.meetingId)}/${encodeURIComponent(r.raceId)}`,
        });
      }
    }
  }
  hits.sort((a, b) => {
    const sa = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const sb = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return sa - sb || (a.jump ?? "").localeCompare(b.jump ?? "");
  });
  return NextResponse.json({ hits: hits.slice(0, 8) }, { headers: { "cache-control": "public, max-age=60" } });
}
