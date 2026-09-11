import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AnalysisRow } from "@/components/AnalysisRow";
import { Locked } from "@/components/Locked";
import { NtgCountdown } from "@/components/Countdown";
import { PaceGrid } from "@/components/PaceGrid";
import { Rankings } from "@/components/Rankings";
import { Results } from "@/components/Results";
import { RunnerTable } from "@/components/RunnerTable";
import { Section } from "@/components/Section";
import { SelectionCards } from "@/components/SelectionCards";
import { TrackMenu, type MiniMeeting } from "@/components/TrackMenu";
import { WhatToWatch } from "@/components/WhatToWatch";
import { getViewer, hasAccess } from "@/lib/auth";
import { planById, planFor } from "@/lib/billing/plans";
import { UsePassButton } from "@/components/UsePassButton";
import { JsonLd, SITE_URL } from "@/components/JsonLd";
import { LiveRefresh } from "@/components/LiveRefresh";
import { NextToGo } from "@/components/NextToGo";
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
  const title = `${meeting.track} Race ${race.raceNumber} tips, ratings and rated prices, ${longDate(date)}`;
  const path = `/racing/${date}/${encodeURIComponent(meetingId)}/${encodeURIComponent(raceId)}`;
  return {
    title,
    description: `${race.name}, ${race.distance}m at ${meeting.track}${race.goingText ? ` on a ${race.goingText} track` : ""}. Benchmark ratings, a pace map and a rated price for every runner, with ${bets} ${bets === 1 ? "bet" : "bets"} and ${lays} ${lays === 1 ? "lay" : "lays"} called.`,
    alternates: { canonical: path },
    openGraph: { title, url: path, type: "article" },
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
  const open = free || hasAccess(viewer, date);
  const field = race.runners.filter((r) => !r.scratched).length;

  // The mini matrix behind the track name: every race on the day, coloured
  // like the board.
  const prime = new Set(selections.filter((s) => s.tag === "prime_overlay").map((s) => s.raceId));
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
      };
    }),
  }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${meeting.track} Race ${race.raceNumber}: ${race.name}`,
    sport: "Horse racing",
    startDate: race.jumpTime,
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: `${meeting.track} Racecourse`, address: { "@type": "PostalAddress", addressRegion: meeting.state, addressCountry: "AU" } },
    organizer: { "@id": `${SITE_URL}/#org` },
    url: `${SITE_URL}/racing/${date}/${encodeURIComponent(meetingId)}/${encodeURIComponent(raceId)}`,
    description: `${race.distance}m ${race.className ?? ""} with ${field} runners. Ratings, rated prices and tips by The Overlay.`,
    competitor: race.runners
      .filter((r) => !r.scratched)
      .map((r) => ({ "@type": "SportsTeam", name: r.horseName, identifier: String(r.tabNumber) })),
  };

  return (
    <div className="page space-y-4">
      <JsonLd data={schema} />
      <LiveRefresh />
      {viewer.admin && !card.card.released && (
        <p className="border border-lime bg-lime-soft px-3 py-2 text-xs rounded-md font-semibold">
          Admin preview. Members cannot see the calls for this race until {RELEASE_HOUR}am on the day.
        </p>
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
            {meeting.races.map((r) => (
              <Link
                key={r.raceId}
                href={`/racing/${date}/${meetingId}/${r.raceId}`}
                className={`race-tab ${r.raceId === raceId ? "is-current" : ""} ${r.result ? "is-resulted" : ""}`}
              >
                R{r.raceNumber}
              </Link>
            ))}
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

      {!released ? (
        <ReleaseNotice hour={RELEASE_HOUR} />
      ) : open ? (
        <Section id="selections" letter="O" title="Our selections" aside="Live price against our rated price, top four">
          <div className="section-body">
            <SelectionCards race={race} />
          </div>
        </Section>
      ) : (
        <Locked id="selections" title="Our selections" letter="O" raceId={raceId} />
      )}

      {open && released ? <AnalysisRow race={race} /> : null}

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
