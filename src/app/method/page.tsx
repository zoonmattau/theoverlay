import type { Metadata } from "next";
import Link from "next/link";

import { Badge, RankChip } from "@/components/Badge";
import { Factors } from "@/components/Factors";
import { RatingTiles, SignalBadge } from "@/components/Ratings";
import type { RunnerRatings } from "@/lib/model/types";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "What you see on The Overlay: a rating for every runner, a price for every horse, and a clear call on where the market has it wrong.",
};

/** A sample horse, so the page shows the real components rather than describing them. */
const SAMPLE: RunnerRatings = {
  class: 71.4,
  early: 74.1,
  mid: 72.4,
  late: 75.3,
  pressure: 73.9,
  tempo: { fast: 72.8, slow: 70.2 },
  going: { good: 71.4, soft: 69.6, heavy: 68.1 },
  distance: 72.6,
  track: 71.9,
  today: 74.2,
  factors: { going: 0.5, tempo: 0.7, distance: 0.6, weight: 1.2, jockey: -0.2 },
  runs: 5,
  ppir: 3,
  map: "on pace",
};

const RATINGS = [
  ["Today", "The one number we price off, the horse's rating for this race under today's conditions."],
  ["Class", "How good the horse is, on the same scale as the race classes, so a BM64 horse rates around 64 and a Group 1 horse well above 100."],
  ["Early, Mid, Late", "How it runs each part of a race, so you can see who has the early speed and who finishes hardest."],
  ["Pressure", "How it holds up when the leaders go hard early."],
  ["Fast and slow tempo", "How it goes when a race is run fast or slow."],
  ["Good, Soft, Heavy", "How it handles each kind of ground."],
  ["Distance and Track", "How it goes at today's trip and at today's track."],
  ["Map", "Where we expect it to settle: leader, on pace, midfield or back."],
] as const;

export default function Page() {
  return (
    <div className="page max-w-4xl">
      <section className="py-6 max-w-2xl">
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.02]">
          Every runner rated.{" "}
          <span className="bg-lime px-2 box-decoration-clone">Every price checked.</span>
        </h1>
        <p className="mt-4 text-ink-secondary">
          Here is what you see on every race, and what each part means.
        </p>
      </section>

      {/* 1. Ratings */}
      <section className="section">
        <div className="section-bar">
          <span className="section-letter">1</span>
          <h2>A rating for every runner</h2>
        </div>
        <div className="section-body space-y-4">
          <p className="text-sm text-ink-secondary">
            Every horse in every race gets a set of ratings in benchmark points, built from how it has
            actually run, section by section, and adjusted for today&apos;s race.
          </p>
          <div className="card">
            <div className="flex items-center gap-3 mb-3">
              <RankChip rank={1} />
              <span className="font-display font-extrabold text-lg">4. Sample Runner</span>
              <span className="text-xs text-ink-soft">Bar 5 · 56.5kg</span>
            </div>
            <RatingTiles r={SAMPLE} par={72} />
            <div className="mt-3">
              <Factors r={SAMPLE} compact />
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
            {RATINGS.map(([term, text]) => (
              <div key={term} className="flex gap-3">
                <dt className="font-display font-extrabold shrink-0 w-36">{term}</dt>
                <dd className="text-ink-secondary">{text}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-ink-secondary">
            The chips under the tiles show how Today was built from Class, so you can see why a horse is
            rated up or down for this race.
          </p>
        </div>
      </section>

      {/* 2. Price */}
      <section className="section mt-4">
        <div className="section-bar">
          <span className="section-letter">2</span>
          <h2>A price for every horse</h2>
        </div>
        <div className="section-body grid gap-4 md:grid-cols-[280px_1fr] items-start">
          <div className="pick-card is-top">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="pick-rank">#1</div>
                <div className="pick-name">4. Sample Runner</div>
              </div>
              <SignalBadge signal="back" />
            </div>
            <div className="flex gap-2">
              <div className="price-box">
                <div className="label">Rated</div>
                <div className="value nums">$4.00</div>
              </div>
              <div className="price-box is-back">
                <div className="label">Live</div>
                <div className="value nums">$5.50</div>
              </div>
            </div>
            <p className="pick-why">Rates top of the field at 74.2 with the best closing sectionals, and the market is longer than our price.</p>
          </div>
          <div className="space-y-3 text-sm text-ink-secondary">
            <p>
              <span className="font-bold text-ink">Rated</span> is our price, the number we think the horse is
              worth backing at.
            </p>
            <p>
              <span className="font-bold text-ink">Live</span> is the best price the market is offering right now.
            </p>
            <p>
              <span className="font-bold text-ink">Edge</span> is the gap between the two, shown next to every
              runner in the market table.
            </p>
            <p>
              We lean on the market, because it is the best guide there is, and only move a price where our
              read is strong. Most races the two agree and there is nothing to do.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Calls */}
      <section className="section mt-4">
        <div className="section-bar">
          <span className="section-letter">3</span>
          <h2>The calls</h2>
        </div>
        <div className="section-body grid gap-3 sm:grid-cols-2">
          <Call badge={<Badge tone="back">Bet</Badge>} title="Bet">
            The market is paying more than our price on a horse with a real chance, so the price is on our side.
          </Call>
          <Call badge={<Badge tone="prime">Prime Overlay</Badge>} title="Prime Overlay">
            A bet where our disagreement with the market is at its strongest. There can be a few a day or none, and the biggest is the Overlay of the Day.
          </Call>
          <Call badge={<Badge tone="back">Bet</Badge>} title="Long Overlay">
            The best bet on the card at each-way odds, for when you want a price.
          </Call>
          <Call badge={<Badge tone="lay">Lay</Badge>} title="Lay">
            A horse the market has too short, usually a favourite, and one to bet against on Betfair.
          </Call>
        </div>
      </section>

      {/* 4. Board */}
      <section className="section mt-4">
        <div className="section-bar">
          <span className="section-letter">4</span>
          <h2>Reading the board</h2>
        </div>
        <div className="section-body">
          <div className="grid gap-3 sm:grid-cols-4 mb-4">
            <Cell cls="tip-back" race="R4" line="2h 11m" tag="1 bet" note="A race with a bet" />
            <Cell cls="tip-lay" race="R5" line="2h 41m" tag="1 lay" note="A race with a lay" />
            <Cell cls="tip-prime" race="R6" line="3h 11m" tag="Prime" note="A Prime Overlay" />
            <Cell cls="race-resulted had-back" race="R2" line="6,1,9,3" note="Run, first four home, border shows what we had on" />
          </div>
          <p className="text-sm text-ink-secondary">
            Open any race for the top four, the pressure grid, the rankings, the full market and what to
            watch. One race a day is open to everyone, and the rest open with a plan or a day pass, see{" "}
            <Link href="/pricing" className="text-blue font-semibold">pricing</Link>.
          </p>
        </div>
      </section>

    </div>
  );
}

function Call({ badge, title, children }: { badge: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2">
        {badge}
        <h3 className="font-display font-extrabold">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-ink-secondary">{children}</p>
    </div>
  );
}

function Cell({ cls, race, line, tag, note }: { cls: string; race: string; line: string; tag?: string; note: string }) {
  return (
    <div>
      <div className={`matrix-btn ${cls}`} style={{ pointerEvents: "none" }}>
        <span className="matrix-race">{race}</span>
        <span className={cls.includes("resulted") ? "matrix-result nums" : "matrix-time nums"}>{line}</span>
        {tag && <span className="matrix-count nums">{tag}</span>}
      </div>
      <p className="mt-1 text-xs text-ink-soft">{note}</p>
    </div>
  );
}
