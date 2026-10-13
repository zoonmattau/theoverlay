import Link from "next/link";
import { connection } from "next/server";

import { Fold } from "./Fold";
import { FollowButton } from "./FollowButton";
import { TipsterAvatar } from "./TipsterAvatar";
import { UnitsSpark } from "./RunningUnits";
import { pct, units } from "./TipsterCard";
import { getViewer } from "@/lib/auth";
import { allTipsters, followedTipsters, rankProfiles, tipsterCallCounts, tipsterProfiles } from "@/lib/creators";
import { racingToday } from "@/lib/model/source";

/**
 * The tipsters on the home page: the three in form over 30 days, their line,
 * what they have on today and a Follow button. The home page is where most
 * visitors land, and before this a tipster was only found from the nav.
 */
export async function HomeTipsters() {
  await connection();
  const viewer = await getViewer();
  const tipsters = await allTipsters();
  if (tipsters.length === 0) return null;
  const [profiles, counts, followed] = await Promise.all([tipsterProfiles(tipsters), tipsterCallCounts(racingToday()), followedTipsters(viewer)]);
  const top = rankProfiles(profiles, "30").filter((p) => p.all.n > 0).slice(0, 3);
  if (top.length === 0) return null;
  const following = new Set(followed.map((t) => t.id));
  const today = [...counts.values()].reduce((a, n) => a + n, 0);
  return (
    <Fold title="Tipsters" className="mt-6">
      <p className="text-sm text-ink-secondary">Punters posting their own calls with their reasons, every one settled by us at the price posted. Members see their calls before the jump, and following one puts them in your inbox and on every race page. <Link href="/tipsters" className="text-blue whitespace-nowrap">{today ? `${today} ${today === 1 ? "call" : "calls"} today, see them all` : "See them all"} &rarr;</Link></p>
      <ul className="mt-3 grid gap-3 md:grid-cols-3">
        {top.map((p) => {
          const n = counts.get(p.tipster.id) ?? 0;
          const w = p.windows["30"].n ? p.windows["30"] : p.all;
          return (
            <li key={p.tipster.id} className="rounded-md border border-line p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <TipsterAvatar tipster={p.tipster} size={36} />
                <Link href={`/t/${p.tipster.code}`} className="font-display font-extrabold hover:underline truncate">{p.tipster.name}</Link>
                <span className="ml-auto"><UnitsSpark calls={[...p.recent].reverse()} /></span>
              </div>
              <div className="text-sm">
                <span className={`nums font-bold ${w.units > 0 ? "text-accent" : w.units < 0 ? "text-red" : ""}`}>{units(w.units)}</span>
                <span className="text-ink-soft"> {p.windows["30"].n ? "last 30 days" : "all time"}, {w.hit} of {w.n} landed{w.n >= 10 ? `, ${pct(w.roi)}` : ""}</span>
              </div>
              <div className="mt-auto flex items-center gap-2 text-xs">
                <span className={n ? "font-semibold" : "text-ink-soft"}>{n ? `${n} ${n === 1 ? "call" : "calls"} today` : "Nothing posted today"}</span>
                <span className="ml-auto"><FollowButton code={p.tipster.code} following={following.has(p.tipster.id)} small /></span>
              </div>
            </li>
          );
        })}
      </ul>
    </Fold>
  );
}
