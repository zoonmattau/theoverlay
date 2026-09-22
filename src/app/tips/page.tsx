import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { BookieLink } from "@/components/BookieLink";
import { JsonLd, SITE_URL } from "@/components/JsonLd";
import { MarketHover } from "@/components/MarketHover";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Locked } from "@/components/Locked";
import { SignalBadge } from "@/components/Ratings";
import { Section } from "@/components/Section";
import { Outcome, ReleaseNotice } from "@/components/SelectionCard";
import { TipsterCallTable } from "@/components/TipsterCallTable";
import { ledgerFor } from "@/lib/tips";
import { UsePassButton } from "@/components/UsePassButton";
import { getViewer, hasAccess } from "@/lib/auth";
import { allTipsters, callsOn, followedCalls } from "@/lib/creators";
import { jumpTime, longDate, percent, price, signedPercent } from "@/lib/format";
import { getCardFor, keepFresh, keepPrices, RELEASE_HOUR } from "@/lib/model/source";
import { readMutes } from "@/lib/model/store";
import { setCallOff } from "@/app/admin/actions";
import { CallOffButton } from "@/components/CallOffButton";
import type { CallAdmin } from "@/components/RunnerTable";
import { stakeOf, type PublishedMeeting, type PublishedRunner, type Signal } from "@/lib/model/types";
import { callPrice } from "@/lib/model/types";

export const metadata: Metadata = {
  title: "Today's tips",
  description: "Every bet and lay on today's card in one place, with the result once each race has run.",
  alternates: { canonical: "/tips" },
};

export default function Page({ searchParams }: PageProps<"/tips">) {
  return (
    <div className="page max-w-5xl">
      <LiveRefresh />
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Tips searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * Level stakes, one unit a call, settled at the best price the call was up
 * at, which the ledger keeps so this page and the record agree. A bet
 * returns price minus one when it wins and loses the unit otherwise; a lay
 * keeps the unit when the horse loses and pays price minus one when it wins.
 * Undefined until the race has run or when there is no price to settle at.
 */
function profit(side: Signal, price: number | undefined, position: number | undefined, stake = 1): number | undefined {
  if (position === undefined || !price) return undefined;
  const won = position === 1;
  const units = side === "back" ? (won ? price - 1 : -1) : won ? -(price - 1) : 1;
  return Math.round(units * stake * 100) / 100;
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
  /** The price the call settles at: the best seen while it was live, else the live one. */
  price?: number;
  /** Units won or lost once the race has run. */
  profit?: number;
}

async function Tips({ searchParams }: { searchParams: PageProps<"/tips">["searchParams"] }) {
  await connection();
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const card = await getCardFor(typeof sp.date === "string" ? sp.date : undefined, viewer.admin);
  const { date, meetings, selections, released } = card;
  keepFresh(date, card);
  keepPrices(date, card);
  const open = hasAccess(viewer, date);
  const prime = new Set(selections.filter((s) => s.tag === "prime_overlay" || s.tag === "top_overlay").map((s) => `${s.raceId}:${s.tabNumber}`));
  const ledger = await ledgerFor(date);
  // A follower sees their tipsters' calls above ours, whether or not they have paid.
  const [followed, listed] = await Promise.all([followedCalls(viewer, date), allTipsters()]);
  const jumps = new Map(meetings.flatMap((m) => m.races.map((r) => [r.raceId, r.jumpTime] as const)));
  const theirs = followed.flatMap((f) => f.tips.map((t) => ({ ...t, tipster: f.tipster })));
  const theirsSettled = theirs.filter((t) => t.settled_at);
  const theirsUnits = theirsSettled.reduce((a, t) => a + Number(t.units), 0);
  // Every other listed tipster's calls for the day, so the page holds every tip there is today.
  const followedIds = new Set(followed.map((f) => f.tipster.id));
  const others = await callsOn(date, listed.filter((t) => !followedIds.has(t.id)));

  const calls: Call[] = meetings
    .flatMap((m) =>
      m.races.flatMap((r) =>
        r.runners
          .filter((x) => x.signal && !x.scratched)
          .map((x) => {
            const row = ledger.get(`${r.raceId}:${x.tabNumber}`);
            const struck = callPrice(x) ?? x.marketPrice;
            const at = row?.price ?? struck;
            return {
              meeting: m,
              raceId: r.raceId,
              raceNumber: r.raceNumber,
              jumpTime: r.jumpTime,
              resulted: Boolean(r.result),
              runner: x,
              prime: prime.has(`${r.raceId}:${x.tabNumber}`),
              price: at,
              profit: row?.units ?? profit(x.signal!, at, r.result ? x.finishPosition : undefined, stakeOf(x)),
            };
          }),
      ),
    )
    .sort((a, b) => (a.jumpTime ?? "").localeCompare(b.jumpTime ?? ""));

  // Admin: take a call off today's card from the list itself.
  const offKeys = viewer.admin ? await readMutes(date).catch(() => new Set<string>()) : undefined;
  const callAdmin: CallAdmin | undefined = offKeys ? { date, off: [...offKeys], setOff: setCallOff } : undefined;

  const bets = calls.filter((c) => c.runner.signal === "back");
  const lays = calls.filter((c) => c.runner.signal === "lay");
  const primes = bets.filter((c) => c.prime);
  const settled = calls.filter((c) => c.profit !== undefined);
  const total = settled.reduce((a, c) => a + (c.profit ?? 0), 0);

  // The day's calls as a list, so a search or answer engine can quote them once released.
  const list = released
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `The Overlay tips, ${longDate(date)}`,
        numberOfItems: calls.length,
        itemListElement: calls.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: `${c.meeting.track} R${c.raceNumber}: ${c.runner.signal === "back" ? "Bet" : "Lay"} ${c.runner.tabNumber}. ${c.runner.horseName}`,
          url: `${SITE_URL}/racing/${date}/${encodeURIComponent(c.meeting.meetingId)}/${encodeURIComponent(c.raceId)}`,
        })),
      }
    : null;

  return (
    <>
      {list && <JsonLd data={list} />}
      <section className="py-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">Today&apos;s tips</h1>
        <p className="mt-2 text-ink-secondary">
          {longDate(date)}. Every bet and lay on the card, with the result once the race has run.
        </p>
        <p className="mt-1 text-xs text-ink-soft">Tips are released at {RELEASE_HOUR}:00am AEST each race day, and prices refresh through the day.</p>
        <div className="tips-stats mt-5 grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <StatCard n={primes.length} label={primes.length === 1 ? "prime" : "primes"} tone="prime" />
          <StatCard n={bets.length} label={bets.length === 1 ? "bet" : "bets"} tone="bet" />
          <StatCard n={lays.length} label={lays.length === 1 ? "lay" : "lays"} tone="lay" />
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

      {!released && !viewer.admin && (
        <div className="mb-4">
          <ReleaseNotice hour={RELEASE_HOUR} />
        </div>
      )}
      {viewer.admin && !released && (
        <p className="mb-4 border border-lime bg-lime-soft px-3 py-2 text-xs rounded-md font-semibold">
          Admin preview of {longDate(date)}. Members cannot see these until {RELEASE_HOUR}am on the day.
        </p>
      )}

      {!open && viewer.passCredits > 0 && (
        <div className="card border-blue bg-blue-soft flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm font-semibold">You have day passes.</span>
          <UsePassButton date={date} credits={viewer.passCredits} />
        </div>
      )}

      {/* Every followed tipster's calls for the day in one table; nothing posted, nothing shown. */}
      {theirs.length > 0 && (
        <div className="mb-4">
          <Section
            id="tipsters-today"
            letter="T"
            title={followed.length === 1 ? `${followed[0].tipster.name}'s tips` : "Your tipsters"}
            aside={`${theirs.length} ${theirs.length === 1 ? "call" : "calls"}${theirsSettled.length ? `, ${units(theirsUnits)}u so far` : ""}`}
          >
            <TipsterCallTable tips={theirs} jumps={jumps} />
          </Section>
        </div>
      )}

      {/* The rest of the tipsters' calls today, with a way to follow the ones worth having on the race pages. */}
      {others.length > 0 && (
        <div className="mb-4">
          <Section
            id="tipsters-all"
            letter="T"
            title={theirs.length > 0 ? "Other tipsters today" : "Tipsters today"}
            aside={`${others.length} ${others.length === 1 ? "call" : "calls"} from ${new Set(others.map((t) => t.affiliate_id)).size} ${new Set(others.map((t) => t.affiliate_id)).size === 1 ? "tipster" : "tipsters"}`}
            defaultOpen={theirs.length === 0}
          >
            <TipsterCallTable tips={others} jumps={jumps} />
            <p className="px-4 py-2 text-xs text-ink-soft border-t border-line">Their own calls at their own prices, settled the same way. <Link href="/tipsters" className="underline">Read the records and follow</Link> the ones you rate to have their calls on your race pages.</p>
          </Section>
        </div>
      )}

      {open ? (
        <div className="space-y-4">
          <CallTable id="tips-bets" letter="B" title="Bets" side="back" calls={bets} date={date} admin={callAdmin} />
          <CallTable id="tips-lays" letter="L" title="Lays" side="lay" calls={lays} date={date} admin={callAdmin} />
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
    <div className={`card stat-card text-center ${cls}`}>
      <div className="font-display text-xl sm:text-3xl font-extrabold tracking-tight nums">{n}</div>
      <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1 leading-tight">{label}</div>
      {sub && <div className="hidden sm:block text-xs text-ink-soft mt-0.5">{sub}</div>}
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
  admin: callAdmin,
}: {
  id: string;
  letter: string;
  title: string;
  side: Signal;
  calls: Call[];
  date: string;
  /** Admin only: take a call off today's card from here. */
  admin?: CallAdmin;
}) {
  const total = calls.reduce((a, x) => a + (x.profit ?? 0), 0);
  return (
    <Section id={id} letter={letter} title={title} aside={<span className="nums">{calls.length}</span>}>
      {calls.length === 0 ? (
        <p className="section-body text-sm text-ink-soft">None on today&apos;s card.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table text-sm min-w-[1080px]">
            <thead>
              <tr>
                <th data-col="race">Race</th>
                <th data-col="jump">Jump</th>
                <th data-col="runner">Runner</th>
                <th data-col="live" className="text-right">Live</th>
                <th data-col="rated" className="text-right">Rated</th>
                <th data-col="edge" className="text-right">Edge</th>
                <th data-col="result">Result</th>
                <th data-col="pl" className="text-right">P/L</th>
                <th data-col="sum" className="text-right">Sum</th>
                {callAdmin && <th data-col="block" className="text-right">Today</th>}
              </tr>
            </thead>
            <tbody>
              {calls.map((c, i) => {
                const sofar = calls.slice(0, i + 1);
                const running = sofar.reduce((a, x) => a + (x.profit ?? 0), 0);
                const anySettled = sofar.some((x) => x.profit !== undefined);
                return (
                <tr key={`${c.raceId}-${c.runner.tabNumber}`} className="tip-row">
                  <td data-col="race" className="whitespace-nowrap">
                    <Link href={`/racing/${date}/${c.meeting.meetingId}/${c.raceId}`} className="font-semibold hover:text-blue">
                      {c.meeting.track} R{c.raceNumber}
                    </Link>
                  </td>
                  <td data-col="jump" className="nums text-ink-soft whitespace-nowrap">{c.resulted ? "Run" : jumpTime(c.jumpTime)}</td>
                  <td data-col="runner">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">
                        {c.runner.tabNumber}. {c.runner.horseName}
                      </span>
                      <span className="text-ink-soft text-xs">(B{c.runner.barrier})</span>
                      {c.prime && <span className="badge badge-prime">Prime</span>}
                    </span>
                  </td>
                  <td data-col="live" className="text-right">
                    <MarketHover r={c.runner} className="market-right">
                      <span className={`price-chip ${c.prime ? "is-prime" : side === "back" ? "is-back" : "is-lay"}`}>{price(c.resulted ? c.price : callPrice(c.runner) ?? c.runner.marketPrice)}</span>
                    </MarketHover>
                    {side === "lay" ? null : <BookieLink codes={c.runner.bookies} raceId={c.raceId} className="block text-[10px] mt-0.5" />}
                  </td>
                  <td data-col="rated" className="text-right nums font-semibold whitespace-nowrap">
                    {price(c.runner.ratedPrice)}
                    {c.runner.ratedProbability ? <span className="chance"> · {percent(c.runner.ratedProbability)}</span> : null}
                  </td>
                  <td data-col="edge" className={`text-right nums font-bold ${c.prime ? "text-accent" : side === "back" ? "text-blue" : "text-red"}`}>
                    {signedPercent(c.runner.edge)}
                  </td>
                  <td data-col="result">
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
                        <SignalBadge signal={side} prime={c.prime} />
                        <span className="text-xs text-ink-soft">to run</span>
                      </span>
                    )}
                  </td>
                  <td data-col="pl" data-pending={c.profit === undefined ? "1" : undefined} className={`text-right nums font-semibold ${c.profit === undefined ? "text-ink-soft" : c.profit > 0 ? "text-accent" : c.profit < 0 ? "text-red" : ""}`}>
                    {c.profit === undefined ? "—" : units(c.profit)}
                  </td>
                  <td data-col="sum" className={`text-right nums ${running > 0 ? "text-accent" : running < 0 ? "text-red" : "text-ink-soft"}`}>
                    {anySettled ? units(running) : "—"}
                  </td>
                  {callAdmin && (
                    <td data-col="block" className="text-right">
                      <CallOffButton
                        date={callAdmin.date}
                        raceId={c.raceId}
                        tab={c.runner.tabNumber}
                        horse={c.runner.horseName}
                        side={side === "lay" ? "lay" : "back"}
                        off={callAdmin.off.includes(`${c.raceId}:${c.runner.tabNumber}`)}
                        setOff={callAdmin.setOff}
                        compact
                      />
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="tip-total">
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
