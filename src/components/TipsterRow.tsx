import Link from "next/link";

import { ClickRow } from "./ClickRow";
import { FollowButton } from "./FollowButton";
import { FormDots, pct, units } from "./TipsterCard";
import { TIPSTER_PERIODS, type TipsterPeriod, type TipsterProfile } from "@/lib/creators";
import { price } from "@/lib/format";

/**
 * The leaderboard's header, and one row a tipster under it: the record over
 * the window, all time, the return and strike rate, the prices they play,
 * the run of results and what they have on today. The row opens their page.
 */
export function TipsterHead({ period }: { period: TipsterPeriod }) {
  const wLabel = TIPSTER_PERIODS.find((x) => x.id === period)?.label ?? "30 days";
  return (
    <thead>
      <tr>
        <th data-col="rank" className="text-right">#</th>
        <th data-col="name">Tipster</th>
        <th data-col="window" className="text-right">{period === "all" ? "Units" : wLabel}</th>
        {period !== "all" && <th data-col="all" className="text-right">All time</th>}
        <th data-col="calls" className="text-right" title="Settled calls in the window">Calls</th>
        <th data-col="roi" className="text-right" title="Units won per unit staked">Return</th>
        <th data-col="strike" className="text-right" title="Calls that landed">Strike</th>
        <th data-col="avg" className="text-right" title="Average price struck on bets">Avg bet</th>
        <th data-col="form">Form</th>
        <th data-col="today">Today</th>
        <th data-col="follow"></th>
        <th data-col="more"></th>
      </tr>
    </thead>
  );
}

export function TipsterRow({ p, rank, following, you, today, live, period }: { p: TipsterProfile; rank: number; following: boolean; you: boolean; today: number; live: number; period: TipsterPeriod }) {
  const t = p.tipster;
  const w = period === "all" ? p.all : p.windows[period];
  const tone = (n: number, has: boolean) => (!has ? "text-ink-soft" : n > 0 ? "text-accent" : n < 0 ? "text-red" : "");
  return (
    <ClickRow href={`/t/${t.code}`} className={`tipster-row ${following ? "is-followed" : ""}`}>
      <td data-col="rank" className="text-right nums text-ink-soft">{rank}</td>
      <td data-col="name">
        <Link href={`/t/${t.code}`} className="font-display font-extrabold hover:underline">{t.name}</Link>
        {you && <span className="badge badge-prime ml-2">You</span>}
        {p.followers > 0 && <span className="text-[11px] text-ink-soft ml-2 whitespace-nowrap">{p.followers} {p.followers === 1 ? "follower" : "followers"}</span>}
      </td>
      <td data-col="window" className={`text-right nums font-bold ${tone(w.units, w.n > 0)}`}>{w.n ? units(w.units) : "—"}</td>
      {period !== "all" && <td data-col="all" className={`text-right nums ${tone(p.all.units, p.all.n > 0)}`}>{p.all.n ? units(p.all.units) : "—"}</td>}
      <td data-col="calls" className="text-right nums">{w.n || "—"}</td>
      <td data-col="roi" className={`text-right nums ${tone(w.roi, w.n > 0)}`}>{w.n ? pct(w.roi) : "—"}</td>
      <td data-col="strike" className="text-right nums">{w.n ? `${Math.round((w.hit / w.n) * 100)}%` : "—"}</td>
      <td data-col="avg" className="text-right nums" title={`${p.bets.n} ${p.bets.n === 1 ? "bet" : "bets"}, ${p.lays.n} ${p.lays.n === 1 ? "lay" : "lays"}`}>{p.avgPrice ? price(p.avgPrice) : "—"}</td>
      <td data-col="form"><FormDots recent={p.recent} /></td>
      <td data-col="today" className="text-sm whitespace-nowrap">
        {today ? <>{today} {today === 1 ? "call" : "calls"}{live ? <span className="badge badge-ok ml-1">{live} live</span> : ""}</> : <span className="text-ink-soft">—</span>}
      </td>
      <td data-col="follow" className="text-right"><FollowButton code={t.code} following={following} small /></td>
      <td data-col="more" className="text-right"><Link href={`/t/${t.code}`} className="tipster-more" aria-label={`Every call from ${t.name}`} title="Every call">&rarr;</Link></td>
    </ClickRow>
  );
}
