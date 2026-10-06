import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { JumpTile } from "@/components/Countdown";
import { SocialLinks } from "@/components/SocialLinks";
import { PLANS } from "@/lib/billing/plans";
import { jumpTime, price } from "@/lib/format";
import { getCardFor, RELEASE_HOUR } from "@/lib/model/source";
import { BRAND_SOCIAL } from "@/lib/social";

import board from "../../../public/welcome/board.png";
import call from "../../../public/welcome/call.json";
import rankings from "../../../public/welcome/rankings.png";
import selections from "../../../public/welcome/selections.png";
import speedmap from "../../../public/welcome/speedmap.png";

export const metadata: Metadata = {
  title: "How The Overlay works",
  description: "Every runner rated and priced, a call only where the market has it wrong, and one race free every day. What it is, how to use it and how to start.",
  alternates: { canonical: "/welcome" },
};

/**
 * Where the ads land (6 Oct 2026): a newcomer from Facebook or Instagram
 * gets what The Overlay is, how to use a call and how to start, shown on
 * real screenshots of a race page, with today's free race as the way in.
 * No results or profit lines, since Meta reviews the page an ad sends people
 * to. Re-shoot the pictures with scripts/welcome-shots.mjs.
 */
export default function Page() {
  return (
    <div className="page">
      <div className="mx-auto max-w-5xl">
        <section className="mt-2 grid grid-cols-1 items-center gap-8 overflow-hidden rounded-3xl bg-ink px-5 py-8 text-white sm:px-10 sm:py-12 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-lime">How The Overlay works</p>
            <h1 className="mt-3 font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-balance leading-[1.02]">
              Know what every runner is <span className="bg-lime px-2 text-ink box-decoration-clone">worth.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/75 sm:text-lg">
              We rate every runner in every race we cover and put our own price on it. When the market&apos;s price is wrong, we tell you.
            </p>
            <Suspense fallback={<div className="skeleton h-12 mt-6 max-w-sm" />}>
              <FreeRaceButton />
            </Suspense>
            <p className="mt-3 text-xs text-white/60">One race free every day. 7 days free on any plan, cancel any time.</p>
          </div>
          <HeroCall />
        </section>

        <Feature
          n="1"
          title="Every runner rated"
          shot={<Shot src={rankings} alt="Every runner in the race ranked on today's rating, with its live price" fade />}
        >
          A benchmark rating for the whole field, on the scale you already read. Sort it by early speed, the finish, pressure or the going.
        </Feature>
        <Feature
          n="2"
          title="Our price beside theirs"
          shot={<Shot src={selections} alt="Our top four in a race: each runner's live price beside our rated price, with the call on top" />}
          flip
        >
          A rated price on every horse next to the live market. Where the two are close, there is nothing to do. Where they are far apart, there is.
        </Feature>
        <Feature n="3" title="The shape of the race" shot={<Shot src={speedmap} alt="The speed map: where each runner is expected to settle, back to leader" />}>
          Who leads, who gets back and how much pressure is in it, drawn for every race.
        </Feature>
        <Feature
          n="4"
          title="A call only on a gap"
          shot={<Shot src={board} alt="Today's meetings: blue races have a bet, red races a lay, white races neither" fade />}
          flip
        >
          <span className="font-semibold text-blue">Blue</span> is a bet, the market is too long. <span className="font-semibold text-red">Red</span> is a lay, the market is too short. White means leave it.
        </Feature>

        <Suspense fallback={<div className="skeleton h-32 mt-10" />}>
          <FreeRace />
        </Suspense>

        <section className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">How to use it</h2>
            <ol className="mt-4 space-y-4">
              <Step n="1" title={`Calls go up at ${RELEASE_HOUR}am`}>On the site first, then by email and in the Discord at 11am.</Step>
              <Step n="2" title="Open a race">Our top four, a rated price for every runner, and the call if there is one.</Step>
              <Step n="3" title="A price on every call">We suggest the price each call is worth taking at.</Step>
              <Step n="4" title="Every call is settled in the open">Winners and losers, on the results page.</Step>
            </ol>
            <p className="mt-4 text-sm text-ink-soft">
              Never laid a horse? The <Link href="/start" className="underline">getting started guide</Link> walks you through it.
            </p>
          </div>
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">How to start</h2>
            <ol className="mt-4 space-y-4">
              <Step n="1" title="See today's free race">One race a day is free, no card and no account needed.</Step>
              <Step n="2" title="Make an account">A minute with your email, or one tap with Google.</Step>
              <Step n="3" title="Pick a plan, 7 days free">
                {PLANS.map((p) => `${p.name} $${p.price}`).join(", ")} a month. Cancel any time from your account.
              </Step>
            </ol>
          </div>
        </section>

        <section className="card mt-14 grid grid-cols-1 items-center gap-5 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <span className="badge badge-prime">Community</span>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight">We&apos;re in the Discord every race day</h2>
            <p className="mt-1 text-ink-secondary">
              The calls, the results and the Saturday review get talked through there, with us and a community that grows every week. Ask why we&apos;re on one, or tell us why we&apos;re wrong.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a href={BRAND_SOCIAL.discord} target="_blank" rel="noopener" className="btn btn-primary">Join the Discord</a>
            <SocialLinks instagram={BRAND_SOCIAL.instagram} twitter={BRAND_SOCIAL.twitter} />
          </div>
        </section>

        <section className="mt-14 rounded-2xl bg-ink px-6 py-8 text-center text-white sm:px-10">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-balance">Start with today&apos;s free race.</h2>
          <p className="mt-2 text-sm text-white/70">No card, no account. Every runner rated and priced.</p>
          <Suspense fallback={<div className="skeleton h-12 mt-5 mx-auto max-w-sm" />}>
            <FreeRaceButton center />
          </Suspense>
        </section>

        <p className="mt-8 mb-4 text-xs text-ink-soft">
          18+ only. Ratings and calls are an opinion, not a promise. Gamble responsibly, <Link href="/responsible-gambling" className="underline">help is here</Link>.
        </p>
      </div>
    </div>
  );
}

/** A phone-width screenshot of the app, framed like a card; tall ones fade out at the foot. */
function Shot({ src, alt, fade, priority }: { src: typeof selections; alt: string; fade?: boolean; priority?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div className={`overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] ${fade ? "max-h-[420px] [mask-image:linear-gradient(to_bottom,black_75%,transparent)]" : ""}`}>
        <Image src={src} alt={alt} sizes="380px" priority={priority} className="block h-auto w-full" />
      </div>
    </div>
  );
}

/** One thing you get: the words on one side, the screenshot on the other, alternating. */
function Feature({ n, title, shot, flip, children }: { n: string; title: string; shot: React.ReactNode; flip?: boolean; children: React.ReactNode }) {
  return (
    <section className="mt-10 grid grid-cols-1 items-center gap-6 md:mt-16 md:grid-cols-2 md:gap-12">
      <div className={flip ? "md:order-2" : ""}>
        <span className="section-letter">{n}</span>
        <h2 className="mt-3 font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h2>
        <p className="mt-2 text-ink-secondary sm:text-lg">{children}</p>
      </div>
      {shot}
    </section>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="section-letter shrink-0">{n}</span>
      <div className="min-w-0">
        <div className="font-display font-extrabold">{title}</div>
        <p className="text-sm text-ink-secondary">{children}</p>
      </div>
    </li>
  );
}

/**
 * One call read out in words: the market's price, ours and what that makes it.
 * The race the screenshots come from, saved with them in call.json by
 * scripts/welcome-shots.mjs, so the card and the pictures tell one story and
 * the race can be one with a bet in it (the free race may only have a lay).
 */
function HeroCall() {
  const pick = call as { tab: number; horse: string; market: number; rated: number; signal?: "prime" | "back" | "lay"; track: string; raceNumber: number; day: string };
  const verdict =
    pick.signal === "lay"
      ? { word: "Lay it", why: "Too short", cls: "bg-red text-white", line: "That makes it a lay." }
      : pick.signal === "back" || pick.signal === "prime"
        ? { word: pick.signal === "prime" ? "Prime bet" : "Back it", why: "Too long", cls: pick.signal === "prime" ? "bg-lime text-ink" : "bg-blue text-white", line: "That makes it a bet." }
        : { word: "Leave it", why: "About right", cls: "bg-panel-alt text-ink", line: "The prices are close, so there is nothing to do." };
  const compare = pick.signal === "lay" ? "shorter than it should be" : pick.signal ? "longer than it should be" : "close to ours";
  return (
    <div className="mx-auto w-full max-w-[440px] rounded-2xl bg-panel p-5 text-ink shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="badge badge-prime">A real call</span>
        <span className="nums text-ink-soft">
          {pick.track} R{pick.raceNumber} · {pick.day}
        </span>
      </div>
      <div className="mt-4 font-display text-2xl font-extrabold tracking-tight leading-tight">
        <span className="text-ink-soft">{pick.tab}.</span> {pick.horse}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-line bg-panel-alt px-2 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-soft">Market</div>
          <div className="mt-1 font-mono text-xl font-bold nums">{price(pick.market)}</div>
        </div>
        <div className="rounded-xl border border-line bg-panel-alt px-2 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-soft">Our price</div>
          <div className="mt-1 font-mono text-xl font-bold nums">{price(pick.rated)}</div>
        </div>
        <div className={`rounded-xl px-2 py-3 ${verdict.cls}`}>
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-80">{verdict.why}</div>
          <div className="mt-1 font-display text-lg font-extrabold leading-tight">{verdict.word}</div>
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-secondary">
        The market had {pick.horse} at {price(pick.market)}. We rated it {price(pick.rated)}, so the market was {compare}. {verdict.line}
      </p>
      <Suspense fallback={null}>
        <HeroFreeLink />
      </Suspense>
    </div>
  );
}

async function HeroFreeLink() {
  const free = await freeRace();
  return (
    <Link href={free?.href ?? "/"} className="mt-4 inline-block text-sm font-bold underline decoration-lime decoration-2 underline-offset-4">
      {free ? "See today's free race" : "See today's races"}
    </Link>
  );
}

/** Today's free race, when the card has released one. */
async function freeRace() {
  await connection();
  const card = await getCardFor(undefined, false);
  if (!card.released) return undefined;
  for (const meeting of card.meetings) {
    const race = meeting.races.find((r) => r.raceId === card.freeRaceId);
    if (race) return { meeting, race, href: `/racing/${card.date}/${meeting.meetingId}/${race.raceId}` };
  }
  return undefined;
}

async function FreeRaceButton({ center }: { center?: boolean }) {
  const free = await freeRace();
  return (
    <div className={`mt-6 flex flex-wrap gap-3 ${center ? "justify-center" : ""}`}>
      <Link href={free?.href ?? "/"} className="btn btn-primary">{free ? "See today's free race" : "See today's races"}</Link>
      <Link href="/signup?next=/pricing" className="btn btn-secondary">Start 7 days free</Link>
    </div>
  );
}

/** The free race up close: what it is, when it jumps, the way in. */
async function FreeRace() {
  const free = await freeRace();
  if (!free) {
    return (
      <section className="card mt-14">
        <span className="badge badge-prime">Free race of the day</span>
        <p className="mt-2 text-sm text-ink-secondary">Today&apos;s free race opens at {RELEASE_HOUR}am with the rest of the calls.</p>
      </section>
    );
  }
  const { meeting, race, href } = free;
  return (
    <section className="card border-lime bg-lime-soft mt-14 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div className="min-w-0">
        <span className="badge badge-prime">Free race of the day</span>
        <h2 className="mt-1.5 font-display text-xl font-extrabold tracking-tight leading-tight">See it working on a real race</h2>
        <p className="mt-1 text-sm text-ink-secondary">Everything above, on today&apos;s race. Free, no card.</p>
      </div>
      <JumpTile title={`${meeting.track} R${race.raceNumber}, ${race.distance}m`} iso={race.jumpTime} clock={jumpTime(race.jumpTime)} run={Boolean(race.result)} />
      <Link href={href} className="btn btn-primary sm:justify-self-end">See the free race</Link>
    </section>
  );
}
