import Link from "next/link";

import { Jumps } from "./Countdown";
import { ReactionBar } from "./ReactionBar";
import { Outcome } from "./SelectionCard";
import { getViewer } from "@/lib/auth";
import { priceFlagged, stakeLabel, struckAt, type CreatorTip, type FeedTip } from "@/lib/creators";
import { jumpTime, price } from "@/lib/format";
import { getCard } from "@/lib/model/source";
import { reactionsFor, type TipReactions } from "@/lib/reactions";

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}u`;
const shortDate = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/**
 * Calls as a list, from one tipster or many: who called it when it is a
 * feed, the call, the race and its countdown, the price, the reason, and the
 * result once it is in. Reactions for a signed-in member. Compact, a call is
 * one line with the reason on hover and no reactions, for the tips page
 * where the model's calls are the point.
 */
export async function CallFeed({ tips, date, empty, withDate, compact }: { tips: (CreatorTip & { tipster?: FeedTip["tipster"] })[]; date: string; empty: string; withDate?: boolean; compact?: boolean }) {
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
  const reactions = compact ? new Map<number, TipReactions>() : await reactionsFor(tips.map((t) => t.id), viewer.id);
  if (tips.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>;
  // Today's calls run next to go first: the live ones in jump order, then the ones that have run.
  const now = Date.now();
  const live = (t: CreatorTip) => !t.settled_at && new Date(jumps.get(t.race_id) || 0).getTime() > now;
  const ordered = withDate ? tips : [...tips].sort((a, b) => Number(live(b)) - Number(live(a)) || (jumps.get(a.race_id) ?? "").localeCompare(jumps.get(b.race_id) ?? "") || a.race_number - b.race_number);
  return (
    <ul className={`divide-y divide-line ${compact ? "call-feed-compact" : ""}`}>
      {ordered.map((t) => {
        const jump = !t.settled_at ? jumps.get(t.race_id) : undefined;
        const u = t.settled_at ? Number(t.units) : undefined;
        if (compact) {
          return (
            <li key={t.id} className="call-line">
              <span className="call-race truncate">
                <span className="font-semibold">{t.track} R{t.race_number}</span>{withDate ? <span className="text-ink-soft">, {shortDate(t.date)}</span> : ""}
                {jump ? <span className="text-ink-soft"> · <Jumps iso={jump} clock={jumpTime(jump)} /></span> : null}
              </span>
              <span className={`badge ${t.side === "lay" ? "badge-lay" : "badge-back"}`}>{t.side === "lay" ? "Lay" : "Bet"}{stakeLabel(t) ? ` ${stakeLabel(t)}` : ""}</span>
              {/* The reason opens off the name on hover; on a phone the name is a link, so a chip takes the tap there. */}
              <span className="flex items-center gap-1.5 min-w-0">
                <Link href={`/racing/${t.date}/${encodeURIComponent(t.meeting_id)}/${encodeURIComponent(t.race_id)}`} className="font-display font-extrabold hover:underline truncate" data-tip={t.comment ?? undefined}>
                  {t.tab_number}. {t.horse_name}
                </Link>
                {t.comment && <span className="call-why sm:hidden" data-tip={t.comment}>why</span>}
              </span>
              <span className="nums text-sm whitespace-nowrap">
                {price(struckAt(t))}{t.bookie ? <span className="text-ink-soft"> {t.bookie}</span> : null}
              </span>
              {u !== undefined ? (
                <span className="flex items-center gap-2 justify-end">
                  <span className={`nums text-sm font-semibold ${u > 0 ? "text-accent" : u < 0 ? "text-red" : ""}`}>{units(u)}</span>
                  <Outcome position={t.finish_position} />
                </span>
              ) : (
                <span className="text-xs text-ink-soft nums whitespace-nowrap">rates {price(Number(t.price))}</span>
              )}
            </li>
          );
        }
        return (
          <li key={t.id} className="call-row">
            <span className={`badge ${t.side === "lay" ? "badge-lay" : "badge-back"}`}>{t.side === "lay" ? "Lay" : "Bet"}{stakeLabel(t) ? ` ${stakeLabel(t)}` : ""}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/racing/${t.date}/${encodeURIComponent(t.meeting_id)}/${encodeURIComponent(t.race_id)}`} className="font-display font-extrabold hover:underline truncate">
                  {t.tab_number}. {t.horse_name}
                </Link>
                <span className="text-xs text-ink-soft">
                  {t.track} R{t.race_number}{withDate ? `, ${shortDate(t.date)}` : ""}
                  {t.tipster ? <> · <Link href={`/t/${t.tipster.code}`} className="hover:underline">{t.tipster.name}</Link></> : null}
                  {jump ? <> · <Jumps iso={jump} clock={jumpTime(jump)} /></> : null}
                </span>
                {priceFlagged(t) && <span className="badge badge-warn" title={`Best price we saw when posted was ${price(Number(t.market_at_post))}`}>over market</span>}
              </div>
              {t.comment && <p className="text-sm text-ink-secondary mt-0.5">{t.comment}</p>}
            </div>
            <div className="call-right">
              <span className="nums text-sm whitespace-nowrap">
                {price(struckAt(t))}
                {t.bookie ? <span className="text-ink-soft"> {t.bookie}</span> : null}
              </span>
              {u !== undefined ? (
                <span className="flex items-center gap-2 justify-end">
                  <span className={`nums text-sm font-semibold ${u > 0 ? "text-accent" : u < 0 ? "text-red" : ""}`}>{units(u)}</span>
                  <Outcome position={t.finish_position} />
                </span>
              ) : (
                <span className="text-xs text-ink-soft nums">rates {price(Number(t.price))}</span>
              )}
              <ReactionBar tipId={t.id} counts={reactions.get(t.id)?.counts ?? { fire: 0, nod: 0, target: 0, eyes: 0 }} mine={reactions.get(t.id)?.mine ?? []} signedIn={Boolean(viewer.id)} compact />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
