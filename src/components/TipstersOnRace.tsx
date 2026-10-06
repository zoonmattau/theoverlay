import Link from "next/link";

import { Fold } from "./Fold";
import { FollowButton } from "./FollowButton";
import { pct, units } from "./TipsterCard";
import { stakeLabel, struckAt, type CreatorTip, type TipsterProfile } from "@/lib/creators";
import { price } from "@/lib/format";

/**
 * Calls on this race from tipsters the viewer does not follow yet, each with
 * the tipster's record and a Follow button: the race page is where most
 * people first meet a tipster. A followed tipster's calls show above, in
 * their own block. Settled calls show their result.
 */
export function TipstersOnRace({ calls }: { calls: { profile: TipsterProfile; tip: CreatorTip }[] }) {
  if (calls.length === 0) return null;
  return (
    <Fold title="Tipsters on this race" className="mb-4">
      <Link href="/tipsters" className="text-xs text-blue">All tipsters</Link>
      <ul className="divide-y divide-line">
        {calls.map(({ profile: p, tip: t }) => {
          const u = t.settled_at ? Number(t.units) : undefined;
          return (
            <li key={t.id} className="py-3 flex flex-wrap items-start gap-3">
              <span className="h-9 w-9 shrink-0 rounded-full bg-lime text-ink font-display font-extrabold flex items-center justify-center" aria-hidden>{p.tipster.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <Link href={`/t/${p.tipster.code}`} className="font-display font-extrabold hover:underline">{p.tipster.name}</Link>
                  <span className="text-xs text-ink-soft">
                    {p.all.n ? <><span className={`nums font-semibold ${p.all.units > 0 ? "text-accent" : p.all.units < 0 ? "text-red" : ""}`}>{units(p.all.units)}</span> over {p.all.n} calls{p.all.n >= 10 ? `, ${pct(p.all.roi)}` : ""}</> : "new"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                  <span className={`badge ${t.side === "lay" ? "badge-lay" : "badge-back"}`}>{t.side === "lay" ? "Lay" : "Bet"}{stakeLabel(t) ? ` ${stakeLabel(t)}` : ""}</span>
                  <span className="font-semibold">{t.tab_number}. {t.horse_name}</span>
                  <span className="nums text-ink-soft">at {price(struckAt(t))}</span>
                  {u !== undefined && <span className={`nums font-semibold ${u > 0 ? "text-accent" : u < 0 ? "text-red" : ""}`}>{units(u)}</span>}
                </div>
                {t.comment && <p className="mt-1 text-sm text-ink-secondary">{t.comment}</p>}
              </div>
              <FollowButton code={p.tipster.code} following={false} small />
            </li>
          );
        })}
      </ul>
    </Fold>
  );
}
