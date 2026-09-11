import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Locked } from "@/components/Locked";
import { SignalBadge } from "@/components/Ratings";
import { Section } from "@/components/Section";
import { Outcome } from "@/components/SelectionCard";
import { UsePassButton } from "@/components/UsePassButton";
import { getViewer, hasAccess } from "@/lib/auth";
import { jumpTime, longDate, price, priceWithChance, signedPercent } from "@/lib/format";
import { getTodayCard, keepFresh } from "@/lib/model/source";
import type { PublishedMeeting, PublishedRunner, Signal } from "@/lib/model/types";

export const metadata: Metadata = {
  title: "Today's tips",
  description: "Every bet and lay on today's card in one place, with the result once each race has run.",
  alternates: { canonical: "/tips" },
};

export default function Page() {
  return (
    <div className="page max-w-5xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Tips />
      </Suspense>
    </div>
  );
}

/**
 * Level stakes, one unit a call, settled at the last price we saw. A bet
 * returns price minus one when it wins and loses the unit otherwise; a lay
 * keeps the unit when the horse loses and pays price minus one when it wins.
 * Undefined until the race has run or when there is no price to settle at.
 */
function profit(side: Signal, price: number | undefined, position: number | undefined): number | undefined {
  if (position === undefined || !price) return undefined;
  const won = position === 1;
  if (side === "back") return won ? price - 1 : -1;
  return won ? -(price - 1) : 1;
}

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(2)}`;

interface Call {
  meeting: PublishedMeeting;
  raceId: string;
  raceNumber: number;
  jumpTime?: string;
  resulted: boolean;
  runner: PublishedRunner;
  prime: boolean;
  /** Units won or lost once the race has run. */
  profit?: number;
}

async function Tips() {
  await connection();
  const [card, viewer] = await Promise.all([getTodayCard(), getViewer()]);
  const { date, meetings, selections } = card;
  keepFresh(date, card);
  const open = hasAccess(viewer, date);
  const prime = new Set(selections.filter((s) => s.tag === "prime_overlay").map((s) => `${s.raceId}:${s.tabNumber}`));

  const calls: Call[] = meetings
    .flatMap((m) =>
      m.races.flatMap((r) =>
        r.runners
          .filter((x) => x.signal && !x.scratched)
          .map((x) => ({
            meeting: m,
            raceId: r.raceId,
            raceNumber: r.raceNumber,
            jumpTime: r.jumpTime,
            resulted: Boolean(r.result),
            runner: x,
            prime: prime.has(`${r.raceId}:${x.tabNumber}`),
            profit: profit(x.signal!, x.marketPrice, r.result ? x.finishPosition : undefined),
          })),
      ),
    )
    .sort((a, b) => (a.jumpTime ?? "").localeCompare(b.jumpTime ?? ""));

  const bets = calls.filter((c) => c.runner.signal === "back");
  const lays = calls.filter((c) => c.runner.signal === "lay");
  const primes = bets.filter((c) => c.prime);
  const toRun = calls.filter((c) => !c.resulted).length;
  const settled = calls.filter((c) => c.profit !== undefined);
  const total = settled.reduce((a, c) => a + (c.profit ?? 0), 0);

  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">Today&apos;s tips</h1>
        <p className="mt-2 text-ink-secondary">
          {longDate(date)}. Every bet and lay on the card, with the result once the race has run.
        </p>
        <p className="mt-1 text-xs text-ink-soft">Tips are released at 8:00am AEST each race day, and prices refresh through the day.</p>
        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard n={calls.length} label="tips today" sub={`${toRun} still to run`} />
          <StatCard n={bets.length} label={bets.length === 1 ? "bet" : "bets"} tone="bet" />
          <StatCard n={lays.length} label={lays.length === 1 ? "lay" : "lays"} tone="lay" />
          <StatCard n={primes.length} label={primes.length === 1 ? "Prime Overlay" : "Prime Overlays"} tone="prime" />
          {open && (
            <StatCard
              n={settled.length ? units(total) : "—"}
              label="units today"
              sub={settled.length ? `${settled.length} of ${calls.length} settled, level stakes` : "nothing settled yet"}
              tone={total > 0 ? "prime" : total < 0 ? "lay" : undefined}
            />
          )}
        </div>
      </section>

      {!open && viewer.passCredits > 0 && (
        <div className="card border-blue bg-blue-soft flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm font-semibold">You have day passes.</span>
          <UsePassButton date={date} credits={viewer.passCredits} />
        </div>
      )}

      {open ? (
        <div className="space-y-4">
          <CallTable id="tips-bets" letter="B" title="Bets" side="back" calls={bets} date={date} />
          <CallTable id="tips-lays" letter="L" title="Lays" side="lay" calls={lays} date={date} />
        </div>
      ) : (
        <div className="space-y-4">
          <Locked id="tips-bets" title={`Bets (${bets.length})`} letter="B" lines={Math.max(4, bets.length)} heading="Unlock today's tips" />
          <Locked id="tips-lays" title={`Lays (${lays.length})`} letter="L" lines={Math.max(4, lays.length)} heading="Unlock today's tips" />
        </div>
      )}
    </>
  );
}

function StatCard({ n, label, sub, tone }: { n: number | string; label: string; sub?: string; tone?: "bet" | "lay" | "prime" }) {
  const cls =
    tone === "bet"
      ? "border-blue bg-blue-soft"
      : tone === "lay"
        ? "border-red bg-red-soft"
        : tone === "prime"
          ? "border-lime bg-lime-soft"
          : "";
  return (
    <div className={`card text-center ${cls}`}>
      <div className="font-display text-3xl font-extrabold tracking-tight nums">{n}</div>
      <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{label}</div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
    </div>
  );
}

function CallTable({
  id,
  letter,
  title,
  side,
  calls,
  date,
}: {
  id: string;
  letter: string;
  title: string;
  side: Signal;
  calls: Call[];
  date: string;
}) {
  const total = calls.reduce((a, x) => a + (x.profit ?? 0), 0);
  return (
    <Section id={id} letter={letter} title={title} aside={<span className="nums">{calls.length}</span>}>
      {calls.length === 0 ? (
        <p className="section-body text-sm text-ink-soft">None on today&apos;s card.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table text-sm min-w-[900px]">
            <thead>
              <tr>
                <th>Race</th>
                <th>Jump</th>
                <th>Runner</th>
                <th className="text-right">Rated</th>
                <th className="text-right">Live</th>
                <th className="text-right">Edge</th>
                <th>Result</th>
                <th className="text-right">P/L</th>
                <th className="text-right">Sum</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c, i) => {
                const sofar = calls.slice(0, i + 1);
                const running = sofar.reduce((a, x) => a + (x.profit ?? 0), 0);
                const anySettled = sofar.some((x) => x.profit !== undefined);
                return (
                <tr key={`${c.raceId}-${c.runner.tabNumber}`}>
                  <td className="whitespace-nowrap">
                    <Link href={`/racing/${date}/${c.meeting.meetingId}/${c.raceId}`} className="font-semibold hover:text-blue">
                      {c.meeting.track} R{c.raceNumber}
                    </Link>
                  </td>
                  <td className="nums text-ink-soft whitespace-nowrap">{c.resulted ? "Run" : jumpTime(c.jumpTime)}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">
                        {c.runner.tabNumber}. {c.runner.horseName}
                      </span>
                      <span className="text-ink-soft text-xs">(B{c.runner.barrier})</span>
                      {c.prime && <span className="badge badge-prime">Prime</span>}
                    </span>
                  </td>
                  <td className="text-right nums font-semibold whitespace-nowrap">{priceWithChance(c.runner.ratedPrice, c.runner.ratedProbability)}</td>
                  <td className="text-right">
                    <span className={`price-chip ${side === "back" ? "is-back" : "is-lay"}`}>{price(c.runner.marketPrice)}</span>
                  </td>
                  <td className={`text-right nums font-bold ${side === "back" ? "text-blue" : "text-red"}`}>
                    {signedPercent(c.runner.edge)}
                  </td>
                  <td>
                    {c.resulted ? (
                      <span className="flex items-center gap-2">
                        <Outcome position={c.runner.finishPosition} />
                        {side === "lay" && (
                          <span className={`text-xs font-bold ${c.runner.finishPosition === 1 ? "text-red" : "text-accent"}`}>
                            {c.runner.finishPosition === 1 ? "lay lost" : "lay held"}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <SignalBadge signal={side} />
                        <span className="text-xs text-ink-soft">to run</span>
                      </span>
                    )}
                  </td>
                  <td className={`text-right nums font-semibold ${c.profit === undefined ? "text-ink-soft" : c.profit > 0 ? "text-accent" : c.profit < 0 ? "text-red" : ""}`}>
                    {c.profit === undefined ? "—" : units(c.profit)}
                  </td>
                  <td className={`text-right nums ${running > 0 ? "text-accent" : running < 0 ? "text-red" : "text-ink-soft"}`}>
                    {anySettled ? units(running) : "—"}
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} className="text-right text-xs uppercase tracking-[0.06em] font-bold text-ink-soft">Total, one unit a call</td>
                <td className={`text-right nums font-extrabold ${total > 0 ? "text-accent" : total < 0 ? "text-red" : ""}`}>{units(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Section>
  );
}
