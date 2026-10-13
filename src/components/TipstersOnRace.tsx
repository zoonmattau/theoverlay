import Link from "next/link";

import { Fold } from "./Fold";
import { FollowButton } from "./FollowButton";
import { TipsterAvatar, type TipsterFace } from "./TipsterAvatar";
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
              <TipsterAvatar tipster={p.tipster} size={36} />
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

/**
 * Tipsters with a call on a race the viewer cannot open: who has one, never the horse or
 * the side, so the members-only call is a reason to join rather than nothing at all.
 */
export function TipstersLocked({ tipsters, raceId, join }: { tipsters: TipsterFace[]; raceId: string; join: boolean }) {
  if (tipsters.length === 0) return null;
  const names = tipsters.map((t) => t.name);
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const one = tipsters.length === 1;
  return (
    <div className="card border-lime bg-lime-soft mb-4 flex flex-wrap items-center gap-3">
      <div className="flex -space-x-2">
        {tipsters.slice(0, 4).map((t) => <TipsterAvatar key={t.name} tipster={t} size={32} className="ring-2 ring-lime-soft" />)}
      </div>
      <span className="text-sm">
        <strong>{who}</strong> {one ? "has a call" : "have calls"} in this race. Members see {one ? "it" : "them"} before the jump.
      </span>
      {join && <Link href={`/pricing?from=${encodeURIComponent(raceId)}`} className="btn btn-primary btn-sm ml-auto">Join and get a week free</Link>}
    </div>
  );
}
