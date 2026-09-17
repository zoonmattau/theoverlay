import Link from "next/link";

import { Jumps } from "./Countdown";
import { Outcome } from "./SelectionCard";
import { SocialLinks } from "./SocialLinks";
import { priceFlagged, type CreatorTip, type Tipster, type TipsterRecord, struckAt } from "@/lib/creators";
import { getViewer } from "@/lib/auth";
import { jumpTime, price } from "@/lib/format";
import { getCard } from "@/lib/model/source";
import { reactionsFor } from "@/lib/reactions";
import { ReactionBar } from "./ReactionBar";

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}u`;

/**
 * A tipster's calls for the day, shown to their followers above the model's.
 * Labelled as the tipster's, never mixed with ours, and settled the same way.
 */
export async function TipsterTips({ tipster, tips, record, date, compact }: { tipster: Tipster; tips: CreatorTip[]; record?: TipsterRecord; date: string; compact?: boolean }) {
  // Jump times for the countdown on calls still to run, from the day's card.
  const jumps = new Map<string, string>();
  if (tips.some((t) => !t.settled_at)) {
    try {
      const card = await getCard(date);
      for (const m of card.meetings) for (const r of m.races) if (r.jumpTime) jumps.set(r.raceId, r.jumpTime);
    } catch {
      // No card, no countdown.
    }
  }
  if (tips.length === 0 && compact) return null;
  const viewer = await getViewer();
  const reactions = await reactionsFor(tips.map((t) => t.id), viewer.id);
  const settled = tips.filter((t) => t.settled_at);
  const total = settled.reduce((a, t) => a + Number(t.units), 0);
  return (
    <div className="section">
      <div className="section-bar">
        <span className="section-letter">{tipster.name.slice(0, 1).toUpperCase()}</span>
        <h2>{tipster.name}&apos;s tips</h2>
        <SocialLinks instagram={tipster.instagram} twitter={tipster.twitter} tiktok={tipster.tiktok} className="social-links-bar" />
        <span className="aside">
          {settled.length ? `${units(total)} today, ${settled.length} of ${tips.length} run` : `${tips.length} ${tips.length === 1 ? "call" : "calls"} today`}
          {record && record.n > 0 ? ` · ${units(record.units)} all time` : ""}
        </span>
      </div>
      <div className="section-body">
        {tipster.blurb && !compact && <p className="text-xs text-ink-soft mb-3">{tipster.blurb}</p>}
        {tips.length === 0 ? (
          <p className="text-sm text-ink-soft">No calls posted yet today.</p>
        ) : (
          <ul className="divide-y divide-line">
            {tips.map((t) => (
              <li key={t.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`badge ${t.side === "lay" ? "badge-lay" : "badge-back"}`}>{t.side === "lay" ? "Lay" : "Bet"}</span>
                <Link href={`/racing/${date}/${encodeURIComponent(t.meeting_id)}/${encodeURIComponent(t.race_id)}`} className="font-display font-extrabold hover:underline">
                  {t.tab_number}. {t.horse_name}
                </Link>
                <span className="text-xs text-ink-soft uppercase tracking-wider">{t.track} R{t.race_number}</span>
                {!t.settled_at && jumps.get(t.race_id) && (
                  <span className="badge badge-muted nums"><Jumps iso={jumps.get(t.race_id)} clock={jumpTime(jumps.get(t.race_id))} /></span>
                )}
                <span className="nums text-sm">{price(struckAt(t))}{t.bookie ? <span className="text-ink-soft"> at {t.bookie}</span> : null}{t.bookie_price && Number(t.bookie_price) !== Number(t.price) ? <span className="text-ink-soft" title="The tipster's own price for the horse"> · rates {price(Number(t.price))}</span> : null}</span>
                {priceFlagged(t) && <span className="badge badge-warn" title={`Best price we saw when posted was ${price(Number(t.market_at_post))}`}>over market</span>}
                <span className="ml-auto flex items-center gap-2">
                  {t.settled_at && <span className="nums text-sm font-semibold">{units(Number(t.units))}</span>}
                  <Outcome position={t.settled_at ? (t.finish_position ?? 0) : undefined} />
                </span>
                {t.comment && <p className="basis-full text-sm text-ink-secondary">{t.comment}</p>}
                <ReactionBar tipId={t.id} counts={reactions.get(t.id)?.counts ?? { fire: 0, nod: 0, target: 0, eyes: 0 }} mine={reactions.get(t.id)?.mine ?? []} signedIn={Boolean(viewer.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
