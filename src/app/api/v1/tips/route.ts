import { NextResponse, type NextRequest } from "next/server";

import { API_MIN_INTERVAL_S, checkKey } from "@/lib/api-keys";
import { apiAccess, viewerById } from "@/lib/auth";
import { inCallLock } from "@/lib/model/publish";
import { getTodayCard, RELEASE_HOUR } from "@/lib/model/source";
import { callEdge, callPrice, callUnits, stakeOf, type Signal } from "@/lib/model/types";
import { ledgerFor } from "@/lib/tips";

export interface ApiCall {
  track: string;
  state: string;
  raceNumber: number;
  raceId: string;
  /** ISO. */
  jumpTime?: string;
  tabNumber: number;
  horseName: string;
  side: Signal;
  prime: boolean;
  /** Units the call is staked at: 1, or 0.1 on a Way Overlay. */
  stake: number;
  /** Our price. */
  ratedPrice: number;
  /** The price the call settles at: the best seen while it was live, a lay at the exchange price. */
  price?: number;
  /** The price on the card now. */
  livePrice?: number;
  edge?: number;
  /** open: can still change. locked: inside 30 minutes of the jump, fixed. resulted, abandoned: the race is over. */
  status: "open" | "locked" | "resulted" | "abandoned";
  finishPosition?: number;
  /** Units won or lost once settled. */
  units?: number;
  url: string;
}

const noStore = { "cache-control": "private, no-store" };
const fail = (status: number, error: string, headers: Record<string, string> = {}) => NextResponse.json({ error }, { status, headers: { ...noStore, ...headers } });

/**
 * Today's calls for one member, as the tips page shows them. The key goes in
 * an Authorization: Bearer header, one call a minute at most.
 */
export async function GET(request: NextRequest) {
  const key = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!key) return fail(401, "Send your API key as Authorization: Bearer <key>. Make one on your account page.");
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const check = await checkKey(key, ip);
  if (!check.ok) {
    return check.status === 429
      ? fail(429, `One call every ${API_MIN_INTERVAL_S} seconds.`, { "retry-after": String(check.retryAfter ?? API_MIN_INTERVAL_S) })
      : fail(401, "That key is not live. Make a new one on your account page.");
  }

  const viewer = await viewerById(check.userId);
  const card = await getTodayCard(false);
  const { date, meetings, selections, released } = card;
  if (!apiAccess(viewer, date)) return fail(403, viewer.pro ? "Your plan does not cover today." : "The API comes with a plan. Day passes and gift days do not open it.");
  if (!released) return NextResponse.json({ date, released: false, releaseHour: RELEASE_HOUR, calls: [] }, { headers: noStore });

  const ledger = await ledgerFor(date);
  const prime = new Set(selections.filter((s) => s.tag === "prime_overlay" || s.tag === "top_overlay").map((s) => `${s.raceId}:${s.tabNumber}`));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
  const calls: ApiCall[] = meetings
    .flatMap((m) =>
      m.races.flatMap((r) =>
        r.runners
          .filter((x) => x.signal && !x.scratched)
          .map((x): ApiCall => {
            const row = ledger.get(`${r.raceId}:${x.tabNumber}`);
            const live = callPrice(x) ?? x.marketPrice;
            const price = row?.price ?? live;
            const finish = r.result ? x.finishPosition : undefined;
            return {
              track: m.track,
              state: m.state,
              raceNumber: r.raceNumber,
              raceId: r.raceId,
              jumpTime: r.jumpTime,
              tabNumber: x.tabNumber,
              horseName: x.horseName,
              side: x.signal!,
              prime: prime.has(`${r.raceId}:${x.tabNumber}`),
              stake: stakeOf(x),
              ratedPrice: x.ratedPrice,
              price,
              livePrice: live,
              edge: callEdge(x),
              status: r.abandoned ? "abandoned" : r.result ? "resulted" : inCallLock(r.jumpTime) ? "locked" : "open",
              finishPosition: finish,
              units: row?.units ?? (finish !== undefined && price ? callUnits(x.signal!, price, finish, stakeOf(x)) : undefined),
              url: `${site}/racing/${date}/${encodeURIComponent(m.meetingId)}/${encodeURIComponent(r.raceId)}`,
            };
          }),
      ),
    )
    .sort((a, b) => (a.jumpTime ?? "").localeCompare(b.jumpTime ?? ""));

  return NextResponse.json({ date, released: true, builtAt: card.builtAt, calls }, { headers: noStore });
}
