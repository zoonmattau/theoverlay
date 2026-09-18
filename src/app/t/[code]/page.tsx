import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { CallFeed } from "@/components/CallFeed";
import { FollowButton } from "@/components/FollowButton";
import { SocialLinks } from "@/components/SocialLinks";
import { FormDots, pct, perWeek, units, whyFollow } from "@/components/TipsterCard";
import { TipsterTips } from "@/components/TipsterTips";
import { getViewer } from "@/lib/auth";
import { creatorTips, followedTipsters, tipsterByCode, tipsterHistory, tipsterProfiles } from "@/lib/creators";
import { longDate, price } from "@/lib/format";
import { getTodayCard } from "@/lib/model/source";

type Props = PageProps<"/t/[code]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const t = await tipsterByCode(code, { unlisted: true });
  if (!t) return { title: "Tipster not found", robots: { index: false } };
  if (!t.listed) return { title: `${t.name}'s tips`, robots: { index: false } };
  return { title: `${t.name}'s tips`, description: t.blurb ?? `${t.name}'s racing tips on The Overlay, every call settled.`, alternates: { canonical: `/t/${t.code}` } };
}

export default function Page({ params }: Props) {
  return (
    <div className="page max-w-4xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <TipsterPage params={params} />
      </Suspense>
    </div>
  );
}

const shortDate = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

/** A tipster's public page: who they are, the record in full, today's calls, and every call before that. */
async function TipsterPage({ params }: { params: Props["params"] }) {
  await connection();
  const { code } = await params;
  const tipster = await tipsterByCode(code, { unlisted: true });
  const viewer = await getViewer();
  // An unlisted tipster's page is theirs and the admin's to see, nobody else's.
  if (!tipster || (!tipster.listed && !viewer.admin && tipster.user_id !== viewer.id)) notFound();
  const { date } = await getTodayCard(viewer.admin);
  const [tips, [p], history, followingList] = await Promise.all([creatorTips(tipster.id, date), tipsterProfiles([tipster]), tipsterHistory(tipster.id, date), followedTipsters(viewer)]);
  const following = followingList.some((t) => t.id === tipster.id);
  const you = tipster.user_id === viewer.id;
  const tone = (n: number, has: boolean) => (!has ? "" : n > 0 ? "is-up" : n < 0 ? "is-down" : "");

  return (
    <>
      <section className="py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">{tipster.name}</h1>
            <SocialLinks instagram={tipster.instagram} twitter={tipster.twitter} tiktok={tipster.tiktok} className="mt-1" />
            {tipster.blurb && <p className="mt-2 text-ink-secondary">{tipster.blurb}</p>}
            {!tipster.listed && <p className="mt-2 text-sm text-ink-soft">Not public yet: only you and the admins can see this page.</p>}
          </div>
          <span className="flex items-center gap-2">
            {you && <Link href="/tipster" className="btn btn-secondary">Post a call</Link>}
            <FollowButton code={tipster.code} following={following} />
          </span>
        </div>
        <p className="mt-3 text-sm">{whyFollow(p)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
          <FormDots recent={p.recent} />
          <span>{p.followers} {p.followers === 1 ? "follower" : "followers"}</span>
          {p.perWeek > 0 && <span>{perWeek(p.perWeek)}</span>}
          {p.since && <span>posting since {shortDate(p.since)}</span>}
          {p.best && <span>best {p.best.horse} at {price(p.best.price)}, {p.best.track}</span>}
          <span>
            {you ? "This is your page, what your followers see." : following ? `You follow ${tipster.name}: their calls show next to the model's on every race.` : `Follow ${tipster.name} and their calls show next to the model's on every race.`}
            {" "}<Link href="/tipsters" className="text-blue">All tipsters</Link>
          </span>
        </div>

        <div className="tipster-stats mt-5">
          <Stat label="Last 30 days" value={p.month.n ? units(p.month.units) : "—"} sub={p.month.n ? `${p.month.hit} of ${p.month.n} landed` : "nothing settled"} tone={tone(p.month.units, p.month.n > 0)} />
          <Stat label="All time" value={p.all.n ? units(p.all.units) : "—"} sub={p.all.n ? `${p.all.hit} of ${p.all.n} landed` : "nothing settled"} tone={tone(p.all.units, p.all.n > 0)} />
          <Stat label="Return" value={p.all.n ? pct(p.all.roi) : "—"} sub="on turnover, one unit a call" tone={tone(p.all.roi, p.all.n > 0)} />
          <Stat label="Strike rate" value={p.all.n ? `${Math.round((p.all.hit / p.all.n) * 100)}%` : "—"} sub={p.all.n ? "calls that landed" : "no settled calls"} />
          <Stat label="Bets" value={p.bets.n ? units(p.bets.units) : "—"} sub={p.bets.n ? `${p.bets.hit} of ${p.bets.n} won${p.avgPrice ? `, ${price(p.avgPrice)} average` : ""}` : "none settled"} tone={tone(p.bets.units, p.bets.n > 0)} />
          <Stat label="Lays" value={p.lays.n ? units(p.lays.units) : "—"} sub={p.lays.n ? `${p.lays.hit} of ${p.lays.n} held` : "none settled"} tone={tone(p.lays.units, p.lays.n > 0)} />
        </div>
      </section>

      <TipsterTips tipster={tipster} tips={tips} date={date} />

      <section className="section mt-4" id="history">
        <div className="section-bar">
          <span className="section-letter">Σ</span>
          <h2>Every call before today</h2>
          <span className="aside">{history.length ? `The last ${history.length}, newest first` : "Nothing yet"}</span>
        </div>
        <div className="section-body">
          <CallFeed tips={history} date={date} empty={`${tipster.name} has not posted before today.`} withDate />
        </div>
      </section>

      {!you && (
        <div className="card border-lime bg-lime-soft mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm">
            {tipster.name}&apos;s calls sit next to the model&apos;s rated prices for every runner on {longDate(date)}. One race is free every day.
          </span>
          <Link href="/pricing" className="btn btn-primary ml-auto">Start free trial</Link>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={`stat tipster-stat ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="font-display text-2xl font-extrabold tracking-tight nums mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-ink-soft nums mt-0.5">{sub}</div>}
    </div>
  );
}
