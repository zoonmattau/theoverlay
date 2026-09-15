import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { FaqList, JsonLd, ORGANIZATION, WEBSITE, faqSchema, type Faq } from "@/components/JsonLd";
import { JumpTile } from "@/components/Countdown";
import { LiveRefresh } from "@/components/LiveRefresh";

import { NextToGo } from "@/components/NextToGo";
import type { PublishedMeeting, PublishedRace } from "@/lib/model/types";
import { RaceMatrix } from "@/components/RaceMatrix";
import { Record } from "@/components/Record";
import { getViewer, hasAccess } from "@/lib/auth";
import { getCardFor, keepFresh, RELEASE_HOUR } from "@/lib/model/source";
import { jumpTime, longDate } from "@/lib/format";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const FAQ: Faq[] = [
  { q: "What is The Overlay?", a: "The Overlay is an Australian horse racing tips site that rates every runner on the benchmark scale, turns the ratings into a rated price, and calls a bet when the market price is bigger than ours and a lay when it is shorter." },
  { q: "What is an overlay in horse racing?", a: "An overlay is a horse whose market price is longer than its true chance, so a $5 horse we rate a $4 chance is an overlay and worth a bet." },
  { q: "When are the tips released?", a: "Tips are published at 8:00am AEST on each race day and prices refresh through the day until the jump." },
  { q: "Which races are covered?", a: "Every TAB flat meeting in Australia, every state, with one race a day free and the rest open to members." },
  { q: "How much does it cost?", a: "Saturday tips are $19 a month, Saturday plus Wednesday $29, every day $49, all with a 7-day free trial, or day passes from $10 each." },
];

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <div className="page">
      <JsonLd data={[ORGANIZATION, WEBSITE, faqSchema(FAQ)]} />
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
      <FaqList items={FAQ} />
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
  const races = meetings.flatMap((m) => m.races);
  const runners = races.flatMap((r) => r.runners.filter((x) => !x.scratched)).length;
  // Plays for the whole day, bets and lays, run or not, so the number never reads as empty late on.
  const plays = races.flatMap((r) => r.runners).filter((r) => r.signal === "back" || r.signal === "lay").length;
  const free = hasAccess(viewer, card.date) ? undefined : freeRaceOf(card);

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
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Tile n={races.length} label="races rated today" />
        <Tile n={runners} label="runners priced" />
        {released ? (
          <Tile n={plays} label={plays === 1 ? "play today" : "plays today"} accent />
        ) : (
          <Tile n={`${RELEASE_HOUR}am`} label="today's calls release" accent />
        )}
      </div>
    </section>
  );
}

function Tile({ n, label, accent }: { n: number | string; label: string; accent?: boolean }) {
  return (
    <div className={`card text-center ${accent ? "border-lime bg-lime-soft" : ""}`}>
      <div className="font-display text-3xl font-extrabold tracking-tight nums">{n}</div>
      <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{label}</div>
    </div>
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
