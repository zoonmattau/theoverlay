import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { JsonLd, ORGANIZATION, WEBSITE } from "@/components/JsonLd";
import { JumpTile, Jumps } from "@/components/Countdown";
import { LiveRefresh } from "@/components/LiveRefresh";

import { NextToGo } from "@/components/NextToGo";
import type { PublishedMeeting, PublishedRace } from "@/lib/model/types";
import { RaceMatrix } from "@/components/RaceMatrix";
import { Record } from "@/components/Record";
import { now } from "@/lib/admin";
import { getViewer, hasAccess } from "@/lib/auth";
import { getCardFor, keepFresh, RELEASE_HOUR } from "@/lib/model/source";
import { jumpTime, longDate } from "@/lib/format";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};


export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <div className="page">
      <JsonLd data={[ORGANIZATION, WEBSITE]} />
      <LiveRefresh />
      <Suspense fallback={<HeroSkeleton />}>
        <Hero searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<CardSkeleton />}>
        <TodayCard searchParams={searchParams} />
      </Suspense>

      <section className="mt-6">
        <Record />
      </section>

      <WhyUs />
    </div>
  );
}

/** The pitch, with today's numbers behind it so it never reads as empty. */
/** ?date=yyyy-mm-dd, honoured for admins only. */
async function wantedDate(searchParams: PageProps<"/">["searchParams"]): Promise<string | undefined> {
  const sp = await searchParams;
  return typeof sp.date === "string" ? sp.date : undefined;
}

async function Hero({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  // The card is read at request time, never during the build.
  await connection();
  const [viewer, wanted] = await Promise.all([getViewer(), wantedDate(searchParams)]);
  const card = await getCardFor(wanted, viewer.admin);
  const { meetings } = card;
  const released = card.released || viewer.admin;
  const open = hasAccess(viewer, card.date);
  const free = open ? undefined : freeRaceOf(card);
  const href = (m: PublishedMeeting, r: PublishedRace) => `/racing/${card.date}/${m.meetingId}/${r.raceId}`;

  // Next bet: the first race still to run that carries a bet, else the first race still to run.
  const cutoff = now() - 10 * 60_000;
  const upcoming = meetings
    .flatMap((m) => m.races.map((r) => ({ m, r })))
    .filter(({ r }) => r.jumpTime && !r.result && new Date(r.jumpTime).getTime() > cutoff)
    .sort((a, b) => a.r.jumpTime!.localeCompare(b.r.jumpTime!));
  const withBet = released ? upcoming.find(({ r }) => r.runners.some((x) => x.signal === "back" && !x.scratched)) : undefined;
  const next = withBet ?? upcoming[0];
  const nextCall = withBet ? withBet.r.runners.find((x) => x.prime && !x.scratched) ?? withBet.r.runners.find((x) => x.signal === "back" && !x.scratched) : undefined;

  // Today in numbers: races, and the calls whether run or not so the count never reads as empty late on.
  const races = meetings.flatMap((m) => m.races);
  const first = races.map((r) => r.jumpTime).filter(Boolean).sort()[0];
  const calls = races.flatMap((r) => r.runners.filter((x) => x.signal && !x.scratched));
  const bets = calls.filter((x) => x.signal === "back").length;
  const lays = calls.filter((x) => x.signal === "lay").length;
  const toRun = upcoming.reduce((a, { r }) => a + r.runners.filter((x) => x.signal && !x.scratched).length, 0);

  return (
    <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr] items-center py-6">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-balance leading-[1.02]">
          The market has an opinion.{" "}
          <span className="bg-lime px-2 box-decoration-clone">We have the data.</span>
        </h1>
        <p className="mt-4 text-ink-secondary text-base max-w-xl">
          Every runner in every race gets a benchmark rating and a rated price, then we
          tell you where the market has it wrong.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/pricing" className="btn btn-primary">
            Get today&apos;s tips
          </Link>
          {free ? (
            <Link href={`/racing/${card.date}/${free.meeting.meetingId}/${free.race.raceId}`} className="btn btn-secondary">
              See today&apos;s free race
            </Link>
          ) : (
            <a href="#board" className="btn btn-secondary">
              See the board
            </a>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {next ? (
          <Tile href={href(next.m, next.r)} label={withBet ? "Next bet" : "Next to jump"} tone={nextCall?.prime ? "prime" : nextCall ? "bet" : undefined}>
            <div className="font-display text-2xl font-extrabold tracking-tight nums leading-none"><Jumps iso={next.r.jumpTime} clock={jumpTime(next.r.jumpTime)} /></div>
            <div className="mt-1 text-sm font-semibold truncate">{next.m.track} R{next.r.raceNumber}, {jumpTime(next.r.jumpTime)}</div>
            <div className="text-xs text-ink-soft truncate">{nextCall ? `${nextCall.prime ? "Prime Overlay" : "Bet"}: ${open ? `${nextCall.tabNumber}. ${nextCall.horseName}` : "join to see"}` : released ? "No bets left today" : `Calls release at ${RELEASE_HOUR}am`}</div>
          </Tile>
        ) : (
          <Tile href="#board" label="Next bet">
            <div className="font-display text-2xl font-extrabold tracking-tight leading-none">Done</div>
            <div className="mt-1 text-sm font-semibold">Racing is over for today</div>
            <div className="text-xs text-ink-soft">Tomorrow&apos;s board is up tonight</div>
          </Tile>
        )}

        <Tile href="#board" label="Meetings today">
          <div className="font-display text-2xl font-extrabold tracking-tight leading-none nums">{meetings.length} {meetings.length === 1 ? "meeting" : "meetings"}</div>
          <div className="mt-1 text-sm font-semibold nums">{races.length} races rated</div>
          <div className="text-xs text-ink-soft nums">{first ? `First jump ${jumpTime(first)}` : "No racing today"}</div>
        </Tile>

        <Tile href={open ? "/tips" : "/pricing"} label="Calls today" tone="prime">
          <div className="font-display text-2xl font-extrabold tracking-tight leading-none nums">{released ? `${bets + lays} ${bets + lays === 1 ? "play" : "plays"}` : `${RELEASE_HOUR}am`}</div>
          <div className="mt-1 text-sm font-semibold nums">{released ? `${bets} ${bets === 1 ? "bet" : "bets"}, ${lays} ${lays === 1 ? "lay" : "lays"}` : "Calls release on race morning"}</div>
          <div className="text-xs text-ink-soft nums">{released ? (open ? `${toRun} still to run` : "One race free today, the rest with a plan") : "Ratings, prices and calls"}</div>
        </Tile>
      </div>
    </section>
  );
}

/** One hero tile: a small label, then whatever the tile has to say, the whole thing a link. */
function Tile({ href, label, tone, children }: { href: string; label: string; tone?: "prime" | "bet" | "lay"; children: React.ReactNode }) {
  const cls = tone === "prime" ? "border-lime bg-lime-soft" : tone === "bet" ? "border-blue bg-blue-soft" : tone === "lay" ? "border-red bg-red-soft" : "";
  return (
    <Link href={href} className={`card card-hover block min-w-0 ${cls}`}>
      <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-ink-soft mb-1.5">{label}</div>
      {children}
    </Link>
  );
}

async function TodayCard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await connection();
  const [viewer, wanted] = await Promise.all([getViewer(), wantedDate(searchParams)]);
  const card = await getCardFor(wanted, viewer.admin);
  const { date, meetings, selections, live } = card;
  const previewing = viewer.admin && !card.released;
  const released = card.released || viewer.admin;
  keepFresh(date, card);
  const access = hasAccess(viewer, date);
  const free = access ? undefined : freeRaceOf(card);
  const upcoming = meetings.flatMap((m) => m.races).filter((r) => !r.result);
  const backs = upcoming.flatMap((r) => r.runners).filter((r) => r.signal === "back").length;
  const lays = upcoming.flatMap((r) => r.runners).filter((r) => r.signal === "lay").length;

  return (
    <>
      <NextToGo meetings={meetings} selections={selections} date={date} />

      {free && released && <FreeRace date={date} meeting={free.meeting} race={free.race} />}

      <section className="mt-6" id="board">
        {previewing && (
          <p className="mb-3 border border-lime bg-lime-soft px-3 py-2 text-xs rounded-md font-semibold">
            Admin preview of {longDate(date)}. Members cannot see this card until {RELEASE_HOUR}am on the day.
          </p>
        )}
        <div className="panel-head">
          <h2>{wanted === date && viewer.admin ? `Meetings, ${longDate(date)}` : "Today's meetings"}</h2>
          <div className="flex items-center gap-4 text-xs text-ink-soft nums">
            <span>{longDate(date)}</span>
            <span>
              {released ? `${backs} ${backs === 1 ? "bet" : "bets"} · ${lays} ${lays === 1 ? "lay" : "lays"} still to run` : `calls release at ${RELEASE_HOUR}am`}
            </span>
          </div>
        </div>

        {!live && (
          <p className="mb-3 border border-line bg-panel px-3 py-2 text-xs text-ink-soft rounded-md">
            Sample card, set <code className="nums text-ink">FORMKING_API_KEY</code> for live form.
          </p>
        )}

        <RaceMatrix meetings={meetings} selections={selections} date={date} freeRaceId={free?.race.raceId} />
      </section>

    </>
  );
}

/** The free race and its meeting, when the card has one. */
function freeRaceOf(card: { freeRaceId?: string; meetings: PublishedMeeting[] }) {
  for (const meeting of card.meetings) {
    const race = meeting.races.find((r) => r.raceId === card.freeRaceId);
    if (race) return { meeting, race };
  }
  return undefined;
}

/**
 * The free race, put in front of anyone without a plan so they do not have
 * to find it in the matrix: the race, the jump, what we have on in it, and
 * the way in.
 */
function FreeRace({ date, meeting, race }: { date: string; meeting: PublishedMeeting; race: PublishedRace }) {
  const calls = race.runners.filter((x) => x.signal && !x.scratched);
  const bets = calls.filter((x) => x.signal === "back").length;
  const lays = calls.filter((x) => x.signal === "lay").length;
  const words = ["no", "one", "two", "three", "four"];
  const count = (n: number, word: string) => `${words[n] ?? n} ${n === 1 ? word : `${word}s`}`;
  const summary = calls.length === 0 ? "Our top four and a rated price for every runner." : `${count(bets, "bet")}, ${count(lays, "lay")}.`;
  const href = `/racing/${date}/${meeting.meetingId}/${race.raceId}`;
  return (
    <section className="card border-lime bg-lime-soft mt-6 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div className="min-w-0">
        <span className="badge badge-prime">Free race of the day</span>
        <h2 className="mt-1.5 font-display text-xl font-extrabold tracking-tight leading-tight">
          {summary[0].toUpperCase()}{summary.slice(1)}
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">Free to see. Every other race opens with a plan or a day pass.</p>
      </div>
      <JumpTile title={`${meeting.track} R${race.raceNumber}, ${race.distance}m`} iso={race.jumpTime} clock={jumpTime(race.jumpTime)} run={Boolean(race.result)} />
      <Link href={href} className="btn btn-primary sm:justify-self-end">See the free race</Link>
    </section>
  );
}

function WhyUs() {
  return (
    <section className="mt-12 grid gap-3 md:grid-cols-3">
      <div className="card">
        <div className="section-letter mb-2">1</div>
        <h3 className="font-display font-extrabold">Every runner rated</h3>
        <p className="mt-1 text-sm text-ink-secondary">
          Benchmark points for class, early, mid and late speed, pressure, tempo and going, not one number and a hunch.
        </p>
      </div>
      <div className="card">
        <div className="section-letter mb-2">2</div>
        <h3 className="font-display font-extrabold">A price for every horse</h3>
        <p className="mt-1 text-sm text-ink-secondary">
          Our rated price sits next to the live price, so you see the gap before you bet.
        </p>
      </div>
      <div className="card">
        <div className="section-letter mb-2">3</div>
        <h3 className="font-display font-extrabold">Bet or lay, only on a gap</h3>
        <p className="mt-1 text-sm text-ink-secondary">
          A bet needs the market longer than our price, a lay needs it shorter, and most races get neither.
        </p>
      </div>
    </section>
  );
}

function HeroSkeleton() {
  return <div className="skeleton h-48 my-6" />;
}

function CardSkeleton() {
  return (
    <div className="mt-4 space-y-4">
      <div className="skeleton h-16" />
      <div className="skeleton h-56" />
    </div>
  );
}
