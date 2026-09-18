import { CallFeed } from "./CallFeed";
import { SocialLinks } from "./SocialLinks";
import type { CreatorTip, Tipster, TipsterRecord } from "@/lib/creators";

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}u`;

/**
 * A tipster's calls for the day, shown to their followers above the model's.
 * Labelled as the tipster's, never mixed with ours, and settled the same way.
 */
export async function TipsterTips({ tipster, tips, record, date, compact }: { tipster: Tipster; tips: CreatorTip[]; record?: TipsterRecord; date: string; compact?: boolean }) {
  if (tips.length === 0 && compact) return null;
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
        <CallFeed tips={tips} date={date} empty="No calls posted yet today." />
      </div>
    </div>
  );
}
