import type { Metadata } from "next";
import Link from "next/link";

import { BRAND_SOCIAL } from "@/lib/social";

export const metadata: Metadata = {
  title: "How to use The Overlay",
  description: "How to read a call, when the calls come, how to place a bet and how to lay a horse on the exchange.",
  alternates: { canonical: "/start" },
};

const STEPS: { id: string; letter: string; title: string }[] = [
  { id: "read", letter: "1", title: "Read a call" },
  { id: "when", letter: "2", title: "When the calls come" },
  { id: "bet", letter: "3", title: "Place a bet" },
  { id: "lay", letter: "4", title: "Lay a horse" },
  { id: "units", letter: "5", title: "Stakes and results" },
];

/**
 * The onboarding page: what a member does with a call, start to finish,
 * with laying spelled out step by step since most members have never laid
 * a horse. Same dark-bar sections as the questions page.
 */
export default function Page() {
  return (
    <div className="page max-w-3xl">
      <section className="py-8">
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">How to use The Overlay</h1>
        <p className="mt-2 text-ink-secondary">Five minutes to read, then you know what every colour and price on the site means and how to act on it.</p>
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Jump to">
          {STEPS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="faq-link">
              {s.title}
            </a>
          ))}
        </nav>
      </section>

      <div className="space-y-6">
        <Step id="read">
          <P>Every runner gets a rated price, our price for its chance. A call is a runner whose market price is far enough from ours to act on.</P>
          <ul className="start-keys">
            <li><span className="start-key is-back">Bet</span> Back it. The market has it longer than we do.</li>
            <li><span className="start-key is-prime">Prime</span> Our strongest bet of the day.</li>
            <li><span className="start-key is-way">Way Overlay</span> A bet at $21 or more, at a small stake.</li>
            <li><span className="start-key is-lay">Lay</span> Oppose it on the exchange. The market has it shorter than we do.</li>
          </ul>
          <P>Each call carries the one price that matters.</P>
          <ul className="start-list">
            <li><b>Back at $7.90</b> means take $7.90 or bigger. Shorter than that, leave it.</li>
            <li><b>Lay at $4.50</b> means lay at $4.50 or shorter. Longer than that, leave it.</li>
          </ul>
          <P>A price box turns blue or red only when the price on offer right now is good enough. Plain means the price has moved past the line, so wait or skip.</P>
          <Links links={[{ label: "Today's tips", href: "/tips" }, { label: "Today's board", href: "/" }]} />
        </Step>

        <Step id="when">
          <ul className="start-list">
            <li><b>8am</b> calls go up on the site.</li>
            <li><b>11am</b> the bets go out by email and in Discord.</li>
            <li><b>30 minutes before each jump</b> calls lock, and each lay is posted in Discord with its lay at price.</li>
          </ul>
          <P>Calls can change with the market until they lock. Once a horse is called it stays a call for the day.</P>
          <Links links={[{ label: "Join the Discord", href: BRAND_SOCIAL.discord }, { label: "Link Discord to your account", href: "/account" }]} />
        </Step>

        <Step id="bet">
          <ol className="start-list is-numbered">
            <li>Open the call. The best price and the bookmaker holding it sit on the live price, and a tap shows the whole market.</li>
            <li>Check the price on offer is at or above the back at price.</li>
            <li>Back it for your unit stake. A Way Overlay is a tenth of a unit.</li>
          </ol>
          <P>Shop around. Best fixed odds, the price at the jump, SP and Betfair SP all count toward our record, and we settle a bet at the best of them, so you should take the best you can find too.</P>
        </Step>

        <Step id="lay">
          <P>Laying is betting that a horse will not win. You take the bookmaker&apos;s side: if the horse loses you keep the backer&apos;s stake, if it wins you pay out at the price you laid.</P>
          <h3 className="start-h3">Set up</h3>
          <ol className="start-list is-numbered">
            <li>Open a Betfair account at betfair.com.au. It is the only betting exchange in Australia.</li>
            <li>Deposit enough to cover your liability (below), not just your stake.</li>
          </ol>
          <h3 className="start-h3">Lay the call</h3>
          <ol className="start-list is-numbered">
            <li>Find the race and the horse in Betfair&apos;s Win market.</li>
            <li>Look at the pink <b>Lay</b> column. That is the price you can lay at now.</li>
            <li>If it is at or under our lay at price, tap it. If it is longer, wait, or put in your own lay at our price and let a backer take it.</li>
            <li>Enter your unit as the stake. Betfair shows the liability before you confirm.</li>
          </ol>
          <div className="start-example">
            <div className="start-example-title">Example</div>
            <p>Lay at $4.50 or under. Betfair&apos;s lay is $4.20, so it qualifies. Stake $10.</p>
            <ul className="start-list">
              <li>Horse loses: you win <b>$10</b>, less Betfair&apos;s commission.</li>
              <li>Horse wins: you pay <b>$32</b>, that is $10 × ($4.20 − 1).</li>
            </ul>
            <p>If Betfair&apos;s lay were $4.80, you would leave it.</p>
          </div>
          <h3 className="start-h3">Know the liability</h3>
          <P>The shorter the price, the less a lay risks: at $2 a $10 lay risks $10, at $6 it risks $50. Lays win more often than they lose, but each loss is bigger than each win, so keep your unit the same on every lay and never chase.</P>
          <P>Some members lay a fixed liability instead, say $20 a lay whatever the price. That works too. Pick one way and stick to it.</P>
        </Step>

        <Step id="units">
          <P>Every result is in units. One unit is whatever you choose to stake on a normal bet, $5, $20 or $100. Pick an amount you are comfortable losing on a run of bad days, because those come.</P>
          <ul className="start-list">
            <li>A winning bet pays the price less one unit. A losing bet is minus one unit.</li>
            <li>A lay that holds is plus one unit. A lay that loses is minus the price less one.</li>
            <li>An abandoned race is void. A scratched horse is no bet.</li>
          </ul>
          <P>Judge it over months, not days. A single day can swing ten units either way.</P>
          <Links links={[{ label: "Results", href: "/results" }, { label: "Questions", href: "/faq" }]} />
        </Step>
      </div>

      <section className="card mt-8 mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-extrabold tracking-tight">Stuck on something?</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Email <a href="mailto:hello@theoverlay.com.au" className="text-blue font-semibold">hello@theoverlay.com.au</a> or ask in the Discord.
          </p>
        </div>
        <Link href="/responsible-gambling" className="faq-link">
          Responsible gambling <span aria-hidden>→</span>
        </Link>
      </section>
    </div>
  );
}

function Step({ id, children }: { id: string; children: React.ReactNode }) {
  const s = STEPS.find((x) => x.id === id)!;
  return (
    <section id={id} className="section scroll-mt-24">
      <div className="section-bar">
        <span className="section-letter">{s.letter}</span>
        <h2>{s.title}</h2>
      </div>
      <div className="section-body space-y-3 text-sm text-ink-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function Links({ links }: { links: { label: string; href: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {links.map((l) =>
        /^https?:/.test(l.href) ? (
          <a key={l.href} href={l.href} className="faq-link" target="_blank" rel="noopener">
            {l.label} <span aria-hidden>→</span>
          </a>
        ) : (
          <Link key={l.href} href={l.href} className="faq-link">
            {l.label} <span aria-hidden>→</span>
          </Link>
        ),
      )}
    </div>
  );
}
