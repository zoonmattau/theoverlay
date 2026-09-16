import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AnalysisRow } from "@/components/AnalysisRow";
import { Locked } from "@/components/Locked";
import { SettleForm } from "@/components/SettleForm";
import { now } from "@/lib/admin";
import { NtgCountdown } from "@/components/Countdown";
import { PaceGrid } from "@/components/PaceGrid";
import { Rankings } from "@/components/Rankings";
import { Results } from "@/components/Results";
import { RunnerTable } from "@/components/RunnerTable";
import { Section } from "@/components/Section";
import { SelectionCards } from "@/components/SelectionCards";
import { TrackMenu, type MiniMeeting } from "@/components/TrackMenu";
import { TipsterTips } from "@/components/TipsterTips";
import { WhatToWatch } from "@/components/WhatToWatch";
import { getViewer, hasAccess } from "@/lib/auth";
import { followedCalls } from "@/lib/creators";
import { planById, planFor } from "@/lib/billing/plans";
import { UsePassButton } from "@/components/UsePassButton";
import { JsonLd, SITE_URL, breadcrumbs } from "@/components/JsonLd";
import { LiveRefresh } from "@/components/LiveRefresh";
import { NextToGo } from "@/components/NextToGo";
import { RaceNav } from "@/components/RaceNav";
import { groupOf } from "@/components/RaceMatrix";
import { getRaceCard, keepFresh, RELEASE_HOUR } from "@/lib/model/source";
import { ReleaseNotice } from "@/components/SelectionCard";
import { jumpTime, longDate, money } from "@/lib/format";

type Props = PageProps<"/racing/[date]/[meetingId]/[raceId]">;

/** Form King ids can carry spaces ("E FM_110926_2"), which arrive encoded. */
async function ids(params: Props["params"]) {
  const p = await params;
  return {
    date: p.date,
    meetingId: decodeURIComponent(p.meetingId),
    raceId: decodeURIComponent(p.raceId),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date, meetingId, raceId } = await ids(params);
  const card = await getRaceCard(date, meetingId, raceId);
  if (!card) return { title: "Race not found", robots: { index: false } };
  const { meeting, race } = card;
  const calls = race.runners.filter((r) => r.signal && !r.scratched);
  const bets = calls.filter((r) => r.signal === "back").length;
  const lays = calls.filter((r) => r.signal === "lay").length;
  const run = Boolean(race.result?.length);
  const winner = run ? race.runners.find((r) => r.tabNumber === race.result![0]) : undefined;
  const title = run
    ? `${meeting.track} Race ${race.raceNumber} results, ${longDate(date)}: ${winner ? `${winner.horseName} won` : "first four"}`
    : `${meeting.track} Race ${race.raceNumber} tips, ratings and rated prices, ${longDate(date)}`;
  const path = `/racing/${date}/${encodeURIComponent(meetingId)}/${encodeURIComponent(raceId)}`;
  const description = run
    ? `${race.name}, ${race.distance}m at ${meeting.track}. The first four home, dividends, and how our ratings and calls went: ${bets} ${bets === 1 ? "bet" : "bets"} and ${lays} ${lays === 1 ? "lay" : "lays"}.`
    : `${race.name}, ${race.distance}m at ${meeting.track}${race.goingText ? ` on a ${race.goingText} track` : ""}. Benchmark ratings, a pace map and a rated price for every runner, with ${bets} ${bets === 1 ? "bet" : "bets"} and ${lays} ${lays === 1 ? "lay" : "lays"} called.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "article", images: [{ url: `${path}/opengraph-image`, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [`${path}/opengraph-image`] },
  };
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<RaceSkeleton />}>
      <Race params={params} />
    </Suspense>
  );
}

async function Race({ params }: { params: Props["params"] }) {
  const { date, meetingId, raceId } = await ids(params);
  const viewer = await getViewer();
  const card = await getRaceCard(date, meetingId, raceId, viewer.admin);
  if (!card) notFound();
  const { meeting, race, meetings, selections, free } = card;
  keepFresh(date, card.card);
  const released = card.card.released || viewer.admin;
  const idx = meeting.races.findIndex((r) => r.raceId === raceId);
  const raceHref = (r: { raceId: string } | undefined) => (r ? `/racing/${date}/${encodeURIComponent(meetingId)}/${encodeURIComponent(r.raceId)}` : undefined);
  const prevHref = raceHref(meeting.races[idx - 1]);
  const nextHref = raceHref(meeting.races[idx + 1]);
  const open = free || hasAccess(viewer, date);
  const field = race.runners.filter((r) => !r.scratched).length;
  const followed = await followedCalls(viewer, date);
  const inRace = followed.map((f) => ({ ...f, tips: f.tips.filter((t) => t.race_id === raceId) })).filter((f) => f.tips.length > 0);
  const initialsFor = (id: string) => followed.filter((f) => f.tips.some((t) => t.race_id === id)).map((f) => f.tipster.name.trim()[0]?.toUpperCase() ?? "?").join("");

  // The mini matrix behind the track name: every race on the day, coloured
  // like the board.
  const prime = new Set(selections.filter((s) => s.tag === "prime_overlay" || s.tag === "top_overlay").map((s) => s.raceId));
  const mini: MiniMeeting[] = meetings.map((m) => ({
    meetingId: m.meetingId,
    track: m.track,
    condition: m.trackCondition,
    races: m.races.map((r) => {
      const backs = r.runners.some((x) => x.signal === "back");
      const lays = r.runners.some((x) => x.signal === "lay");
      return {
        raceId: r.raceId,
        raceNumber: r.raceNumber,
        clock: jumpTime(r.jumpTime),
        resulted: Boolean(r.result),
        tip: prime.has(r.raceId) ? "prime" : backs ? "back" : lays ? "lay" : undefined,
        group: groupOf(r.className, r.name),
        tipster: initialsFor(r.raceId) || undefined,
      };
    }),
  }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${meeting.track} Race ${race.raceNumber}: ${race.name}`,
    sport: "Horse racing",
    startDate: race.jumpTime,
    eventStatus: race.result?.length ? "https://schema.org/EventCompleted" : "https://schema.org/EventScheduled",
    endDate: race.result?.length ? race.jumpTime : undefined,
    location: { "@type": "Place", name: `${meeting.track} Racecourse`, address: { "@type": "PostalAddress", addressRegion: meeting.state, addressCountry: "AU" } },
    organizer: { "@id": `${SITE_URL}/#org` },
    url: `${SITE_URL}/racing/${date}/${encodeURIComponent(meetingId)}/${encodeURIComponent(raceId)}`,
    description: `${race.distance}m ${race.className ?? ""} with ${field} runners. Ratings, rated prices and tips by The Overlay.`,
    competitor: race.runners
      .filter((r) => !r.scratched)
      .map((r) => ({ "@type": "SportsTeam", name: r.horseName, identifier: String(r.tabNumber) })),
  };

  const trail = breadcrumbs([
    { name: "Today", path: "/" },
    { name: `${meeting.track}, ${longDate(date)}`, path: `/racing/${date}/${encodeURIComponent(meetingId)}/${encodeURIComponent(meeting.races[0]?.raceId ?? raceId)}` },
    { name: `Race ${race.raceNumber}`, path: `/racing/${date}/${encodeURIComponent(meetingId)}/${encodeURIComponent(raceId)}` },
  ]);

  return (
    <div className="page space-y-4">
      <JsonLd data={[schema, trail]} />
      <LiveRefresh />
      <RaceNav prev={prevHref} next={nextHref} />
      {viewer.admin && !card.card.released && (
        <p className="border border-lime bg-lime-soft px-3 py-2 text-xs rounded-md font-semibold">
          Admin preview. Members cannot see the calls for this race until {RELEASE_HOUR}am on the day.
        </p>
      )}
      {viewer.admin && (!race.result?.length || race.handSettled) && race.jumpTime && new Date(race.jumpTime).getTime() < now() && (
        <SettleForm
          date={date}
          meetingId={meetingId}
          raceId={raceId}
          current={race.result ?? []}
          runners={race.runners.filter((x) => !x.scratched).map((x) => ({ tab: x.tabNumber, name: x.horseName }))}
        />
      )}
      <NextToGo meetings={meetings} selections={selections} date={date} />
      {/* Header strip: where we are, the conditions, and every race on the card. */}
      <header className="section !overflow-visible">
        <div className="section-body flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link href="/" className="text-xs text-ink-soft hover:text-ink">
            ← Today
          </Link>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <TrackMenu track={meeting.track} date={date} currentRaceId={raceId} meetings={mini} />
            <span>R{race.raceNumber}</span>
            <span className="text-ink-soft font-semibold text-lg">{race.name}</span>
          </h1>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <span className="race-chip tip" data-tip="Race distance">{race.distance}m</span>
            <span
              className="race-chip tip"
              data-tip={`Race class and its par in benchmark points. A horse rating ${race.classPoints} is a typical ${race.className ?? "runner"} horse.`}
            >
              {race.className ?? "—"} · {race.classPoints}
            </span>
            <span className="race-chip tip" data-tip="Track condition: Firm 1-2, Good 3-4, Soft 5-7, Heavy 8-10">
              {race.goingText ?? race.going}
            </span>
            {meeting.railPosition && (
              <span className="race-chip tip" data-tip={`Rail position: ${meeting.railPosition}`}>
                Rail {meeting.railPosition.split(",")[0]}
              </span>
            )}
            <span className="race-chip tip" data-tip="Total prize money">{money(race.prizeMoney)}</span>
            <span className="race-chip tip" data-tip="Runners after scratchings">{field} runners</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-3">
          <nav className="race-tabs" aria-label="Races at this meeting">
            {meeting.races.map((r) => {
              const tabTip = prime.has(r.raceId) ? "prime" : r.runners.some((x) => x.signal === "back") ? "back" : r.runners.some((x) => x.signal === "lay") ? "lay" : "";
              return (
              <Link
                key={r.raceId}
                href={`/racing/${date}/${meetingId}/${r.raceId}`}
                className={`race-tab ${r.raceId === raceId ? "is-current" : ""} ${r.result ? "is-resulted" : ""} ${tabTip ? `tip-${tabTip}` : ""}`}
              >
                {groupOf(r.className, r.name) && <span className={`medal medal-${groupOf(r.className, r.name)}`} title={`Group ${groupOf(r.className, r.name)}`}>G{groupOf(r.className, r.name)}</span>}
                R{r.raceNumber}
              </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            {race.result ? (
              <span className="race-chip">Result {race.result.join(", ")}</span>
            ) : (
              <NtgCountdown
                href={`/racing/${date}/${meetingId}/${raceId}`}
                iso={race.jumpTime}
                clock={jumpTime(race.jumpTime)}
                label="Jumps"
                tag={longDate(date)}
              />
            )}
          </div>
        </div>
      </header>

      <Results race={race} />

      {free && !hasAccess(viewer, date) && (
        <div className="card border-lime bg-lime-soft flex flex-wrap items-center gap-3">
          <span className="badge badge-prime">Free race</span>
          <span className="text-sm">Today&apos;s free race, every other race opens with a plan or a day pass.</span>
          <Link href="/pricing" className="btn btn-primary ml-auto">See plans</Link>
        </div>
      )}

      {!open && viewer.passCredits > 0 && (
        <div className="card border-blue bg-blue-soft flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">You have day passes.</span>
          <UsePassButton date={date} credits={viewer.passCredits} />
        </div>
      )}

      {!open && viewer.pro && viewer.passCredits === 0 && (
        <div className="card flex flex-wrap items-center gap-3">
          <span className="text-sm">
            Your {planById(viewer.plan)?.name ?? "plan"} plan does not cover {longDate(date)}.
            {planFor(date) ? ` The ${planFor(date)!.name} plan does, or a day pass opens it.` : ""}
          </span>
          <Link href="/pricing" className="btn btn-primary ml-auto">Upgrade or buy a pass</Link>
        </div>
      )}

      {inRace.map((f) => <TipsterTips key={f.tipster.id} tipster={f.tipster} tips={f.tips} date={date} compact />)}

      {!released ? (
        <ReleaseNotice hour={RELEASE_HOUR} />
      ) : open ? (
        <Section id="selections" letter="O" title="Our selections" aside="Live price against our rated price, top four">
          <div className="section-body">
            <SelectionCards race={race} tipsters={inRace.map((f) => ({ name: f.tipster.name, calls: f.tips.map((t) => ({ tabNumber: t.tab_number, side: t.side, price: Number(t.price), bookie: t.bookie, bookiePrice: t.bookie_price ? Number(t.bookie_price) : null, comment: t.comment })) }))} />
          </div>
        </Section>
      ) : (
        <Locked id="selections" title="Our selections" letter="O" raceId={raceId} />
      )}

      {open && released ? (
        <Section id="analysis" letter="A" title="At a glance" aside="Pressure, overlays and top rated" defaultOpen={false}>
          <div className="section-body">
            <AnalysisRow race={race} />
          </div>
        </Section>
      ) : null}

      {open ? <Rankings race={race} /> : <Locked id="rankings" title="Rankings" letter="R" lines={10} raceId={raceId} />}

      <PaceGrid race={race} rail={meeting.railPosition} locked={!open} />

      <RunnerTable race={race} locked={!open} />

      {open ? <WhatToWatch race={race} /> : <Locked id="watch" title="What to watch" letter="W" lines={6} raceId={raceId} />}
    </div>
  );
}

function RaceSkeleton() {
  return (
    <div className="page space-y-4">
      <div className="skeleton h-28" />
      <div className="skeleton h-64" />
      <div className="skeleton h-40" />
      <div className="skeleton h-96" />
    </div>
  );
}
