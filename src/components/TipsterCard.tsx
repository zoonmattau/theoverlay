import Link from "next/link";

import { CallFeed } from "./CallFeed";
import { FollowButton } from "./FollowButton";
import { SocialLinks } from "./SocialLinks";
import type { CreatorTip, TipsterProfile } from "@/lib/creators";
import { price } from "@/lib/format";

export const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}u`;
export const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n * 100).toFixed(0)}%`;
const shortDate = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/**
 * One sentence on why you would follow them, from the numbers: the return,
 * how often they land one, the prices they play, and the reasons they give.
 */
export function whyFollow(p: TipsterProfile): string {
  if (p.all.n === 0) return p.posted ? `${p.posted} ${p.posted === 1 ? "call" : "calls"} posted, none settled yet.` : "No calls yet.";
  // A return on turnover means little until there are ten calls behind it.
  const parts = [`${units(p.all.units)} over ${p.all.n} ${p.all.n === 1 ? "call" : "calls"}${p.all.n >= 10 ? `, ${pct(p.all.roi)} on turnover` : ", early days"}`];
  if (p.bets.n) parts.push(`lands ${p.bets.hit} of ${p.bets.n} ${p.bets.n === 1 ? "bet" : "bets"}${p.avgPrice ? ` at ${price(p.avgPrice)} on average` : ""}`);
  if (p.lays.n) parts.push(`${p.lays.hit} of ${p.lays.n} ${p.lays.n === 1 ? "lay" : "lays"} held`);
  if (p.posted >= 5 && p.reasoned >= 0.8) parts.push("every call comes with a reason");
  return `${parts.join(", ")}.`;
}

/** "3 calls a week", or "a call most weeks" below one. */
export const perWeek = (n: number) => (n < 1 ? "a call most weeks" : `${Math.round(n)} ${Math.round(n) === 1 ? "call" : "calls"} a week`);

/** The last ten settled calls as dots, newest on the right: lime landed, red lost. */
export function FormDots({ recent }: { recent: TipsterProfile["recent"] }) {
  if (recent.length === 0) return <span className="text-xs text-ink-soft">No settled calls yet</span>;
  return (
    <span className="form-dots" title="The last ten settled calls, newest on the right">
      {[...recent].reverse().map((r, i) => (
        <span key={i} className={`form-dot ${r.won ? "is-won" : "is-lost"}`} title={`${r.horse}, ${shortDate(r.date)}: ${units(r.units)}`} />
      ))}
    </span>
  );
}

/**
 * A tipster in the directory: who they are, the record, the run, why you
 * would follow, and a dropdown with today's calls (how many still to run)
 * and their last few before that.
 */
export function TipsterCard({ p, rank, following, you, today, live, recent, date }: { p: TipsterProfile; rank: number; following: boolean; you: boolean; today: CreatorTip[]; live: number; recent: CreatorTip[]; date: string }) {
  const t = p.tipster;
  const summary = today.length
    ? `${today.length} ${today.length === 1 ? "call" : "calls"} today${live ? `, ${live} still to run` : ", all run"}`
    : recent.length
      ? `Nothing today, last ${recent.length} ${recent.length === 1 ? "call" : "calls"}`
      : "No calls yet";
  const tone = (n: number, has: boolean) => (!has ? "" : n > 0 ? "is-up" : n < 0 ? "is-down" : "");
  return (
    <div className={`card tipster-card ${following ? "border-lime" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="tipster-rank nums">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/t/${t.code}`} className="font-display text-xl font-extrabold tracking-tight hover:underline">{t.name}</Link>
            <SocialLinks instagram={t.instagram} twitter={t.twitter} tiktok={t.tiktok} />
            {you && <span className="badge badge-prime">You</span>}
            {live > 0 && <span className="badge badge-ok">{live} live</span>}
          </div>
          {t.blurb && <p className="text-sm text-ink-secondary mt-0.5">{t.blurb}</p>}
        </div>
        <FollowButton code={t.code} following={following} small />
      </div>

      <p className="text-sm mt-3">{whyFollow(p)}</p>

      <div className="tipster-stats mt-3">
        <Stat label="30 days" value={p.month.n ? units(p.month.units) : "—"} sub={p.month.n ? `${p.month.hit} of ${p.month.n}` : "nothing settled"} tone={tone(p.month.units, p.month.n > 0)} />
        <Stat label="All time" value={p.all.n ? units(p.all.units) : "—"} sub={p.all.n ? `${p.all.hit} of ${p.all.n}` : "nothing settled"} tone={tone(p.all.units, p.all.n > 0)} />
        <Stat label="Return" value={p.all.n ? pct(p.all.roi) : "—"} sub="on turnover" tone={tone(p.all.roi, p.all.n > 0)} />
        <Stat label="Avg bet" value={p.avgPrice ? price(p.avgPrice) : "—"} sub={p.bets.n ? `${p.bets.n} bets, ${p.lays.n} lays` : "no bets yet"} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        <FormDots recent={p.recent} />
        <span>{p.followers} {p.followers === 1 ? "follower" : "followers"}</span>
        {p.perWeek > 0 && <span>{perWeek(p.perWeek)}</span>}
        {p.since && <span>since {shortDate(p.since)}</span>}
        {p.best && <span>best {p.best.horse} at {price(p.best.price)}</span>}
        <Link href={`/t/${t.code}`} className="ml-auto text-blue">Every call →</Link>
      </div>

      {(today.length > 0 || recent.length > 0) && (
        <details className="tipster-calls mt-3">
          <summary>{summary}</summary>
          {today.length > 0 && (
            <div className="mt-2">
              <div className="stat-label">Today</div>
              <CallFeed tips={today} date={date} empty="" />
            </div>
          )}
          {recent.length > 0 && (
            <div className="mt-2">
              <div className="stat-label">Before today</div>
              <CallFeed tips={recent} date={date} empty="" withDate />
            </div>
          )}
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={`stat tipster-stat ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="font-display text-lg font-extrabold tracking-tight nums">{value}</div>
      {sub && <div className="text-[11px] text-ink-soft nums">{sub}</div>}
    </div>
  );
}
