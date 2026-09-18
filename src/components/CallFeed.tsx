import Link from "next/link";

import { Jumps } from "./Countdown";
import { ReactionBar } from "./ReactionBar";
import { Outcome } from "./SelectionCard";
import { getViewer } from "@/lib/auth";
import { priceFlagged, struckAt, type CreatorTip, type FeedTip } from "@/lib/creators";
import { jumpTime, price } from "@/lib/format";
import { getCard } from "@/lib/model/source";
import { reactionsFor } from "@/lib/reactions";

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}u`;
const shortDate = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/**
 * Calls as a list, from one tipster or many: who called it when it is a
 * feed, the call, the race and its countdown, the price, the reason, and the
 * result once it is in. Reactions for a signed-in member.
 */
export async function CallFeed({ tips, date, empty, withDate }: { tips: (CreatorTip & { tipster?: FeedTip["tipster"] })[]; date: string; empty: string; withDate?: boolean }) {
  const jumps = new Map<string, string>();
  if (tips.some((t) => !t.settled_at && t.date === date)) {
    try {
      const card = await getCard(date);
      for (const m of card.meetings) for (const r of m.races) if (r.jumpTime) jumps.set(r.raceId, r.jumpTime);
    } catch {
      // No card, no countdown.
    }
  }
  const viewer = await getViewer();
  const reactions = await reactionsFor(tips.map((t) => t.id), viewer.id);
  if (tips.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {tips.map((t) => (
        <li key={t.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {t.tipster && <Link href={`/t/${t.tipster.code}`} className="badge badge-muted hover:border-ink">{t.tipster.name}</Link>}
          <span className={`badge ${t.side === "lay" ? "badge-lay" : "badge-back"}`}>{t.side === "lay" ? "Lay" : "Bet"}</span>
          <Link href={`/racing/${t.date}/${encodeURIComponent(t.meeting_id)}/${encodeURIComponent(t.race_id)}`} className="font-display font-extrabold hover:underline">
            {t.tab_number}. {t.horse_name}
          </Link>
          <span className="text-xs text-ink-soft uppercase tracking-wider">{withDate ? `${shortDate(t.date)} · ` : ""}{t.track} R{t.race_number}</span>
          {!t.settled_at && jumps.get(t.race_id) && (
            <span className="badge badge-muted nums"><Jumps iso={jumps.get(t.race_id)} clock={jumpTime(jumps.get(t.race_id))} /></span>
          )}
          <span className="nums text-sm">
            {price(struckAt(t))}
            {t.bookie ? <span className="text-ink-soft"> at {t.bookie}</span> : null}
            {t.bookie_price && Number(t.bookie_price) !== Number(t.price) ? <span className="text-ink-soft" title="The tipster's own price for the horse"> · rates {price(Number(t.price))}</span> : null}
          </span>
          {priceFlagged(t) && <span className="badge badge-warn" title={`Best price we saw when posted was ${price(Number(t.market_at_post))}`}>over market</span>}
          <span className="ml-auto flex items-center gap-2">
            {t.settled_at && <span className={`nums text-sm font-semibold ${Number(t.units) > 0 ? "text-accent" : Number(t.units) < 0 ? "text-red" : ""}`}>{units(Number(t.units))}</span>}
            <Outcome position={t.settled_at ? (t.finish_position ?? 0) : undefined} />
          </span>
          {t.comment && <p className="basis-full text-sm text-ink-secondary">{t.comment}</p>}
          <ReactionBar tipId={t.id} counts={reactions.get(t.id)?.counts ?? { fire: 0, nod: 0, target: 0, eyes: 0 }} mine={reactions.get(t.id)?.mine ?? []} signedIn={Boolean(viewer.id)} />
        </li>
      ))}
    </ul>
  );
}
