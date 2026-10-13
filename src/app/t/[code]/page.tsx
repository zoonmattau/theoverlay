import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Jumps } from "@/components/Countdown";
import { Fold } from "@/components/Fold";
import { FollowButton } from "@/components/FollowButton";
import { ReactionBar } from "@/components/ReactionBar";
import { RunningUnits } from "@/components/RunningUnits";
import { Outcome } from "@/components/SelectionCard";
import { SocialLinks } from "@/components/SocialLinks";
import { TipsterAvatar } from "@/components/TipsterAvatar";
import { FormDots, pct, perWeek, units } from "@/components/TipsterCard";
import { now } from "@/lib/admin";
import { getViewer, hasAccess } from "@/lib/auth";
import { creatorTips, followedTipsters, followersOf, tipVisible, stakeLabel, struckAt, TIPSTER_PERIODS, tipsterByCode, tipsterHistory, tipsterPeriod, tipsterProfiles, type CreatorTip } from "@/lib/creators";
import { jumpTime, longDate, price } from "@/lib/format";
import { getTodayCard } from "@/lib/model/source";
import { reactionsFor } from "@/lib/reactions";

type Props = PageProps<"/t/[code]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const t = await tipsterByCode(code, { unlisted: true });
  if (!t) return { title: "Tipster not found", robots: { index: false } };
  if (!t.listed) return { title: `${t.name}'s tips`, robots: { index: false } };
  return { title: `${t.name}'s tips`, description: t.blurb ?? `${t.name}'s racing tips on The Overlay, every call settled.`, alternates: { canonical: `/t/${t.code}` } };
}

export default function Page({ params, searchParams }: Props) {
  return (
    <div className="page max-w-4xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <TipsterPage params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const day = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const monthYear = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
const tone = (n: number) => (n > 0 ? "text-accent" : n < 0 ? "text-red" : "");
const raceHref = (t: CreatorTip) => `/racing/${t.date}/${encodeURIComponent(t.meeting_id)}/${encodeURIComponent(t.race_id)}`;
/** Days of history shown before "Show more". */
const DAYS_SHOWN = 10;

/**
 * A tipster's page, built to answer "should I follow them?" at a glance: who
 * they are, their record as a line and four figures over the window picked,
 * today's calls with the live price beside the one they posted (and, for a
 * member, our rated price and whether the model agrees), then every call
 * before today, a day at a time with the day's total.
 */
async function TipsterPage({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  await connection();
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const tipster = await tipsterByCode(code, { unlisted: true });
  const viewer = await getViewer();
  // An unlisted tipster's page is theirs and the admin's to see, nobody else's.
  if (!tipster || (!tipster.listed && !viewer.admin && tipster.user_id !== viewer.id)) notFound();
  const card = await getTodayCard(viewer.admin);
  const date = card.date;
  const [todayAll, [p], history, followingList] = await Promise.all([creatorTips(tipster.id, date), tipsterProfiles([tipster]), tipsterHistory(tipster.id, date, 2000), followedTipsters(viewer)]);
  const member = hasAccess(viewer, date);
  // Calls still to run are for members only; their own page always shows a tipster everything.
  const today = todayAll.filter(tipVisible(member || tipster.user_id === viewer.id));
  const todayHidden = todayAll.length - today.length;
  const reactions = await reactionsFor(today.map((t) => t.id), viewer.id);
  const following = followingList.some((t) => t.id === tipster.id);
  // The admin can open the follower count to see who they are.
  const followers = viewer.admin ? await followersOf(tipster.id) : [];
  const you = tipster.user_id === viewer.id;

  // The window the record shows, and the calls in it, oldest first for the line.
  const period = tipsterPeriod(sp.p);
  const w = TIPSTER_PERIODS.find((x) => x.id === period)!;
  const from = "days" in w ? new Date(now() - w.days * 86400_000).toISOString().slice(0, 10) : "";
  const settled = [...today, ...history].filter((t) => t.settled_at && t.finish_position !== null && t.date >= from).sort((a, b) => a.date.localeCompare(b.date) || a.race_number - b.race_number);
  const rec = p.windows[period];

  // Today's calls against the card: the jump, the live price, and for a member our price and call.
  const runner = new Map<string, { jump?: string; live?: number; lay?: number; rated?: number; signal?: string }>();
  for (const m of card.meetings) for (const r of m.races) for (const x of r.runners) runner.set(`${r.raceId}:${x.tabNumber}`, { jump: r.jumpTime, live: x.marketPrice, lay: x.layPrice, rated: x.ratedPrice, signal: x.signal ?? undefined });

  // History a day at a time, filtered to a side if asked.
  const side = sp.side === "back" || sp.side === "lay" ? sp.side : undefined;
  const byDay = new Map<string, CreatorTip[]>();
  for (const t of history.filter((t) => !side || t.side === side)) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
  const days = [...byDay.entries()];
  const href = (q: { p?: string; side?: string }) => {
    const s = new URLSearchParams();
    const pp = q.p ?? period, ss = q.side === "" ? undefined : (q.side ?? side);
    if (pp !== "all") s.set("p", pp);
    if (ss) s.set("side", ss);
    return `/t/${tipster.code}${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      {/* Who they are, once. */}
      <section className="py-6 flex flex-wrap items-start gap-4">
        <TipsterAvatar tipster={tipster} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">{tipster.name}</h1>
            <SocialLinks instagram={tipster.instagram} twitter={tipster.twitter} tiktok={tipster.tiktok} />
          </div>
          {tipster.blurb && <p className="mt-1 text-ink-secondary">{tipster.blurb}</p>}
          <div className="mt-1 text-xs text-ink-soft">
            {[p.perWeek > 0 ? perWeek(p.perWeek) : "", p.since ? `posting since ${monthYear(p.since)}` : "", p.best ? `best win ${p.best.horse} at ${price(p.best.price)}` : ""].filter(Boolean).map((x) => `${x} · `).join("")}
            {viewer.admin && followers.length ? (
              <details className="inline">
                <summary className="inline cursor-pointer list-none"><b className="text-sm text-ink">{p.followers}</b> {p.followers === 1 ? "follower" : "followers"} <span className="underline decoration-dotted">who?</span></summary>
                <ul className="mt-2 mb-1 max-w-xl max-h-72 overflow-auto rounded-lg border border-line bg-panel p-2 text-sm text-ink">
                  {followers.map((f) => (
                    <li key={f.id} className="flex items-baseline justify-between gap-4 py-0.5">
                      <Link href={`/admin/${f.id}`} className="font-semibold hover:text-blue">{f.name}</Link>
                      <span className="text-xs text-ink-soft">{f.email} · since {new Date(f.since).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <span><b className="text-sm text-ink">{p.followers}</b> {p.followers === 1 ? "follower" : "followers"}</span>
            )}
          </div>
          {!tipster.listed && <p className="mt-1 text-sm text-ink-soft">Not public yet: only you and the admins can see this page.</p>}
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-1 w-full sm:w-auto">
          <span className="flex items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            {you && <Link href="/tipster" className="btn btn-secondary">Post a call</Link>}
            <FollowButton code={tipster.code} following={following} />
          </span>
          {!you && <span className="text-[11px] text-ink-soft sm:text-right sm:max-w-56">{following ? "Their calls are on your race pages and in your inbox." : "Get their calls by email and on every race page."}</span>}
        </div>
      </section>

      {/* The record: the line, then four figures, over the window picked. */}
      <Fold
        title="Record"
        className="mb-4"
        controls={
          <div className="flex flex-wrap gap-1" role="group" aria-label="Window">
            {TIPSTER_PERIODS.map((x) => (
              <Link key={x.id} href={href({ p: x.id })} scroll={false} className={`btn btn-sm ${x.id === period ? "btn-primary" : "btn-secondary"}`}>{x.label}</Link>
            ))}
          </div>
        }
      >
        <RunningUnits calls={settled.map((t) => ({ date: t.date, units: Number(t.units) }))} />
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Figure label="Units" value={rec.n ? units(rec.units) : "—"} cls={tone(rec.units)} />
          <Figure label="Return" value={rec.n ? pct(rec.roi) : "—"} cls={tone(rec.roi)} sub="on turnover" />
          <Figure label="Strike rate" value={rec.n ? `${Math.round((rec.hit / rec.n) * 100)}%` : "—"} sub={rec.n ? `${rec.hit} of ${rec.n} landed` : undefined} />
          <Figure label="Calls" value={String(rec.n)} sub={p.avgPrice ? `bets at ${price(p.avgPrice)} avg` : undefined} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
          <span className="flex items-center gap-2">Last 10 <FormDots recent={p.recent} /></span>
          {p.bets.n > 0 && <span>Bets <strong className={`nums ${tone(p.bets.units)}`}>{units(p.bets.units)}</strong>, {p.bets.hit} of {p.bets.n} won</span>}
          {p.lays.n > 0 && <span>Lays <strong className={`nums ${tone(p.lays.units)}`}>{units(p.lays.units)}</strong>, {p.lays.hit} of {p.lays.n} held</span>}
          <span>All time unless picked above. Settled by us at the price posted, one unit unless staked otherwise.</span>
        </div>
      </Fold>

      {/* Today, as cards. */}
      <Fold title={<>Today <span className="font-sans text-xs font-normal text-ink-soft ml-1">{longDate(date)}</span></>} className="mb-4">
        {todayHidden > 0 && (
          <p className="text-sm mb-3">
            <strong>{todayHidden} {todayHidden === 1 ? "call" : "calls"} still to run</strong>, for members only. <Link href="/pricing" className="font-semibold text-blue hover:underline">See the plans</Link>
          </p>
        )}
        {today.length === 0 ? (
          todayHidden > 0 ? null : <p className="text-sm text-ink-soft">{tipster.name} has not posted today{following ? ". You will get an email when they do." : "."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {[...today].sort((a, b) => (runner.get(`${a.race_id}:${a.tab_number}`)?.jump ?? "").localeCompare(runner.get(`${b.race_id}:${b.tab_number}`)?.jump ?? "")).map((t) => {
              const r = runner.get(`${t.race_id}:${t.tab_number}`) ?? {};
              const agrees = member && r.signal && (r.signal === t.side);
              return (
                <li key={t.id} className="py-3 flex gap-3">
                  <span className={`badge self-start mt-1 ${t.side === "lay" ? "badge-lay" : "badge-back"}`}>{t.side === "lay" ? "Lay" : "Bet"}{stakeLabel(t) ? ` ${stakeLabel(t)}` : ""}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <Link href={raceHref(t)} className="font-display font-extrabold hover:underline">{t.tab_number}. {t.horse_name}</Link>
                      <span className="text-xs text-ink-soft">{t.track} R{t.race_number}{!t.settled_at && r.jump ? <> · <Jumps iso={r.jump} clock={jumpTime(r.jump)} /></> : null}</span>
                      {agrees && <span className="badge badge-prime">Model agrees</span>}
                    </div>
                    {t.comment && <p className="text-sm text-ink-secondary mt-1">{t.comment}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span>Posted <strong className="nums">{price(struckAt(t))}</strong>{t.bookie ? <span className="text-ink-soft"> {t.bookie}</span> : null}</span>
                      {/* A lay is struck on the exchange, so its live price is the lay price. */}
                      {!t.settled_at && (t.side === "lay" ? r.lay : r.live) ? <span className="text-ink-soft">Now <span className="nums">{price((t.side === "lay" ? r.lay : r.live)!)}</span></span> : null}
                      {!t.settled_at && (member ? (r.rated ? <span className="text-ink-soft">Our rated <span className="nums text-ink">{price(r.rated)}</span></span> : null) : <Link href="/pricing" className="text-blue">Our rated price: members</Link>)}
                      {t.settled_at && (
                        <span className="flex items-center gap-2">
                          <span className={`nums font-semibold ${tone(Number(t.units))}`}>{units(Number(t.units))}</span>
                          <Outcome position={t.finish_position} />
                        </span>
                      )}
                      <span className="ml-auto">
                        <ReactionBar tipId={t.id} counts={reactions.get(t.id)?.counts ?? { fire: 0, nod: 0, target: 0, eyes: 0 }} mine={reactions.get(t.id)?.mine ?? []} signedIn={Boolean(viewer.id)} compact />
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Fold>

      {/* Every call before today, a day at a time. The filters sit inside, so a tap on one never folds it. */}
      <Fold
        id="history"
        title="Every call before today"
        className="mb-4"
        controls={
          <div className="flex gap-1" role="group" aria-label="Side">
            {[["", "All"], ["back", "Bets"], ["lay", "Lays"]].map(([id, label]) => (
              <Link key={id} href={`${href({ side: id })}#history`} scroll={false} className={`btn btn-sm ${(side ?? "") === id ? "btn-primary" : "btn-secondary"}`}>{label}</Link>
            ))}
          </div>
        }
      >
        {days.length === 0 ? (
          <p className="text-sm text-ink-soft">{tipster.name} has not posted {side === "lay" ? "a lay " : side === "back" ? "a bet " : ""}before today.</p>
        ) : (
          <>
            <Days days={days.slice(0, DAYS_SHOWN)} />
            {days.length > DAYS_SHOWN && (
              <details className="group/more">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-sm font-semibold text-blue mt-3 group-open/more:hidden">Show {days.length - DAYS_SHOWN} more days</summary>
                <Days days={days.slice(DAYS_SHOWN)} />
              </details>
            )}
          </>
        )}
      </Fold>

      {!you && !member && (
        <div className="card border-lime bg-lime-soft mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm">See {tipster.name}&apos;s calls next to our rated price for every runner, and whether the model agrees. One race is free every day.</span>
          <Link href="/pricing" className="btn btn-primary ml-auto">Start free trial</Link>
        </div>
      )}
    </>
  );
}

function Figure({ label, value, sub, cls = "" }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft">{label}</div>
      <div className={`font-display text-2xl font-extrabold tracking-tight nums ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-soft nums">{sub}</div>}
    </div>
  );
}

/** Days of calls: the day and its total as a heading, then each call on a line. */
function Days({ days }: { days: [string, CreatorTip[]][] }) {
  return (
    <div>
      {days.map(([d, list]) => {
        const done = list.filter((t) => t.settled_at);
        const total = done.reduce((a, t) => a + Number(t.units), 0);
        return (
          <div key={d} className="mt-3 first:mt-0">
            <div className="flex items-baseline justify-between border-b border-line pb-1 text-xs">
              <span className="font-bold uppercase tracking-[0.06em] text-ink-soft">{day(d)}</span>
              <span className="text-ink-soft">{list.length} {list.length === 1 ? "call" : "calls"}{done.length ? <> · <strong className={`nums ${tone(total)}`}>{units(total)}</strong></> : ""}</span>
            </div>
            <ul>
              {list.map((t) => (
                <li key={t.id} className="py-2 flex items-start gap-3 text-sm">
                  <span className={`badge mt-0.5 ${t.side === "lay" ? "badge-lay" : "badge-back"}`}>{t.side === "lay" ? "Lay" : "Bet"}{stakeLabel(t) ? ` ${stakeLabel(t)}` : ""}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={raceHref(t)} className="font-semibold hover:underline">{t.tab_number}. {t.horse_name}</Link>
                    <span className="text-xs text-ink-soft"> {t.track} R{t.race_number}</span>
                    {t.comment && <p className="text-xs text-ink-soft mt-0.5">{t.comment}</p>}
                  </div>
                  <span className="nums text-xs text-ink-soft whitespace-nowrap mt-0.5">{price(struckAt(t))}</span>
                  {t.settled_at ? (
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className={`nums font-semibold w-14 text-right ${tone(Number(t.units))}`}>{units(Number(t.units))}</span>
                      <Outcome position={t.finish_position} />
                    </span>
                  ) : (
                    <span className="text-xs text-ink-soft whitespace-nowrap">to settle</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
