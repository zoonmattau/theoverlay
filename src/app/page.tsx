import Link from "next/link";
import { Suspense } from "react";

import { NextToGo } from "@/components/NextToGo";
import { RaceMatrix } from "@/components/RaceMatrix";
import { LockedSelectionCard, NoBetNotice, SelectionCard } from "@/components/SelectionCard";
import { getViewer, hasAccess } from "@/lib/auth";
import { UsePassButton } from "@/components/UsePassButton";
import { getTodayCard } from "@/lib/model/source";
import { longDate } from "@/lib/format";

export default function Page() {
  return (
    <div className="page">
      <Suspense fallback={<HeroSkeleton />}>
        <Hero />
      </Suspense>

      <Suspense fallback={<CardSkeleton />}>
        <TodayCard />
      </Suspense>

      <WhyUs />
    </div>
  );
}

/** The pitch, with today's numbers behind it so it never reads as empty. */
async function Hero() {
  const { meetings } = await getTodayCard();
  const races = meetings.flatMap((m) => m.races);
  const runners = races.flatMap((r) => r.runners.filter((x) => !x.scratched)).length;
  // Calls for the whole day, run or not, so the number never reads as empty late on.
  const all = races.flatMap((r) => r.runners);
  const bets = all.filter((r) => r.signal === "back").length;
  const lays = all.filter((r) => r.signal === "lay").length;

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
          <a href="#board" className="btn btn-secondary">
            See the board
          </a>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Tile n={races.length} label="races rated today" />
        <Tile n={runners} label="runners priced" />
        <Tile n={bets + lays} label={`calls today: ${bets} ${bets === 1 ? "bet" : "bets"}, ${lays} ${lays === 1 ? "lay" : "lays"}`} accent />
      </div>
    </section>
  );
}

function Tile({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className={`card text-center ${accent ? "border-lime bg-lime-soft" : ""}`}>
      <div className="font-display text-3xl font-extrabold tracking-tight nums">{n}</div>
      <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{label}</div>
    </div>
  );
}

async function TodayCard() {
  const [{ date, meetings, selections, live }, viewer] = await Promise.all([getTodayCard(), getViewer()]);
  const open = hasAccess(viewer, date);
  const upcoming = meetings.flatMap((m) => m.races).filter((r) => !r.result);
  const backs = upcoming.flatMap((r) => r.runners).filter((r) => r.signal === "back").length;
  const lays = upcoming.flatMap((r) => r.runners).filter((r) => r.signal === "lay").length;

  return (
    <>
      <NextToGo meetings={meetings} selections={selections} date={date} />

      <section className="mt-6" id="board">
        <div className="panel-head">
          <h2>Today&apos;s meetings</h2>
          <div className="flex items-center gap-4 text-xs text-ink-soft nums">
            <span>{longDate(date)}</span>
            <span>
              {backs} {backs === 1 ? "bet" : "bets"} · {lays} {lays === 1 ? "lay" : "lays"} still to run
            </span>
          </div>
        </div>

        {!live && (
          <p className="mb-3 border border-line bg-panel px-3 py-2 text-xs text-ink-soft rounded-md">
            Sample card, set <code className="nums text-ink">FORMKING_API_KEY</code> for live form.
          </p>
        )}

        <RaceMatrix meetings={meetings} selections={selections} date={date} />
      </section>

      <section className="mt-8">
        <div className="panel-head">
          <h2>Today&apos;s overlays</h2>
          {open ? (
            <span className="text-xs text-ink-soft nums">
              {selections.filter((s) => s.finishPosition === undefined).length} still to run
            </span>
          ) : (
            <Link href="/pricing" className="text-xs font-bold text-blue">
              Unlock them all
            </Link>
          )}
        </div>

        {!open && viewer.passCredits > 0 && (
          <div className="card border-blue bg-blue-soft flex flex-wrap items-center gap-3 mb-4">
            <span className="text-sm font-semibold">You have day passes.</span>
            <UsePassButton date={date} credits={viewer.passCredits} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {selections.length > 0 ? (
            selections.map((s) =>
              open ? (
                <SelectionCard key={`${s.tag}-${s.raceId}-${s.tabNumber}`} s={s} date={date} />
              ) : (
                <LockedSelectionCard key={`${s.tag}-${s.raceId}-${s.tabNumber}`} s={s} />
              ),
            )
          ) : (
            <div className="sm:col-span-2 lg:col-span-3">
              <NoBetNotice />
            </div>
          )}
        </div>
      </section>
    </>
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
