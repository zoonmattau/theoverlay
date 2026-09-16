import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { buildReview, type LedgerRow, type Review, type ReviewedRace, type ReviewedRunner } from "@/lib/model/review";
import { Section } from "@/components/Section";
import { ClickRow } from "../ClickRow";
import { FetchButton } from "../FetchButton";
import { dayLabel as label, finish, gapClass, price, raceLabel, reviewHref, signed, stageOf, Tag, unitsClass } from "../shared";

export const metadata: Metadata = { title: "Weekly review", robots: { index: false } };
/** A fetch batch runs for minutes. */
export const maxDuration = 300;

export default function Page({ params }: PageProps<"/admin/review/[date]">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Day params={params} />
      </Suspense>
    </div>
  );
}

async function Day({ params }: { params: PageProps<"/admin/review/[date]">["params"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const review = await buildReview(date);
  if (!review) notFound();
  const c = review.counts;
  const resulted = review.races.some((r) => r.race.result?.length);

  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold"><Link href="/admin/review" className="underline">Weekly review</Link></p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{label(date)}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {c.wanted} runners wanted: every NSW and VIC runner plus the ten best bets and ten best lays. {c.fetched} fetched, {c.full} with full benchmarks, {c.partial} partial, {c.missing} to go. {c.credits} credits spent.
          </p>
        </div>
        {resulted ? <FetchButton date={date} missing={c.missing} partial={c.partial} /> : <span className="text-sm text-ink-soft">Nothing has run yet.</span>}
      </section>

      {c.fetched === 0 ? (
        <div className="card text-sm text-ink-soft">
          Fetch the runs once the meetings are done. NSW, VIC and WA metro benchmarks are complete by Monday; QLD and SA take most of the week, so refetch those later.
        </div>
      ) : (
        <>
          <Talking review={review} />
          <Meetings review={review} />
          <Ledger title="Our bets" rows={review.bets} date={date} />
          <Ledger title="Our lays" rows={review.lays} date={date} />
          <Ranking review={review} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Runs title="Best runs against class" rows={review.best} date={date} />
            <Runs title="Worst runs against class" rows={review.worst} date={date} />
            <Runs title="Fastest last 600 against class" rows={review.closers} date={date} late />
          </div>
          <Races review={review} />
        </>
      )}
    </>
  );
}

function Ledger({ title, rows, date }: { title: string; rows: LedgerRow[]; date: string }) {
  const settled = rows.filter((r) => r.units !== undefined);
  const units = settled.reduce((a, r) => a + (r.units ?? 0), 0);
  const won = settled.filter((r) => (r.units ?? 0) > 0).length;
  const gaps = rows.map((r) => r.gap).filter((g): g is number => g !== undefined);
  const meanGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : undefined;
  return (
    <Section id={`review-${title.toLowerCase().replace(/\s+/g, "-")}`} letter={title.includes("lay") ? "L" : "B"} title={title} aside={`${rows.length} calls, ${won} of ${settled.length} won, ${signed(units)}u${meanGap !== undefined ? `, ran ${signed(meanGap)} against our marks on average` : ""}`}>
      <div className="overflow-x-auto">
      <table className="data-table w-full text-sm">
        <thead>
          <tr>
            <th>Race</th><th>Horse</th><th>Tag</th>
            <th className="text-right">Edge</th><th className="text-right">Our mark</th><th className="text-right">Our price</th><th className="text-right">Market</th><th className="text-right">SP</th>
            <th>Result</th><th className="text-right">Ran to</th><th className="text-right">Gap</th><th className="text-right">Early</th><th className="text-right">Last 600</th><th className="text-right">Units</th><th>Data</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ClickRow key={`${r.race.raceId}:${r.runner.tabNumber}`} href={`/admin/review/${date}/${r.race.raceId}`}>
              <td><Link href={`/admin/review/${date}/${r.race.raceId}`} className="underline">{r.meeting.track} R{r.race.raceNumber}</Link></td>
              <td className="font-semibold">{r.runner.tabNumber}. {r.runner.horseName}</td>
              <td><Tag tag={r.tag} side={r.side} prime={r.runner.prime} /></td>
              <td className="text-right nums">{r.runner.edge !== undefined ? `${signed(r.runner.edge * 100, 0)}%` : ""}</td>
              <td className="text-right nums">{r.runner.ratings.today.toFixed(1)}</td>
              <td className="text-right nums">{price(r.runner.ratedPrice)}</td>
              <td className="text-right nums">{price(r.runner.marketPrice)}</td>
              <td className="text-right nums">{price(r.sp)}</td>
              <td className="nums">{finish(r)}</td>
              <td className="text-right nums">{r.ranTo?.toFixed(1) ?? ""}</td>
              <td className={`text-right nums ${gapClass(r.gap)}`}>{signed(r.gap)}</td>
              <td className="text-right nums">{signed(r.early)}</td>
              <td className="text-right nums">{signed(r.late)}{r.lateRank ? ` (${r.lateRank})` : ""}</td>
              <td className={`text-right nums ${r.units !== undefined && r.units > 0 ? "text-emerald-700" : r.units !== undefined && r.units < 0 ? "text-red-700" : ""}`}>{signed(r.units, 2)}</td>
              <td className="text-ink-soft text-xs">{stageOf(r)}</td>
            </ClickRow>
          ))}
          {rows.length === 0 && <tr><td colSpan={15} className="text-ink-soft">None on the card.</td></tr>}
        </tbody>
      </table>
      </div>
    </Section>
  );
}

const KIND_CLASS: Record<string, string> = {
  "run of the day": "badge-prime",
  "under the radar": "badge-back",
  disappointing: "badge-lay",
  improver: "badge-accent",
  "on the mark": "",
};

function Talking({ review }: { review: Review }) {
  if (review.talking.length === 0) return null;
  return (
    <Section id="review-talking" letter="T" title="Talking points" aside="Over the runs with a full benchmark, leaving out races whose first three all ran five lengths above class">
      <ul className="space-y-2 text-sm">
        {review.talking.map((t, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-2">
            <span className={`badge ${KIND_CLASS[t.kind] ?? ""} whitespace-nowrap`}>{t.kind}</span>
            <span>{t.text}</span>
            <Link href={reviewHref(t.runner.race, review.date)} className="text-xs underline text-ink-soft whitespace-nowrap">the race</Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Meetings({ review }: { review: Review }) {
  return (
    <Section id="review-meetings" letter="M" title="By meeting" aside="Bias reads the race's par against our marks; vs field is how far runners strayed from their place in our order; fit is how well our order matched the run">
      <div className="overflow-x-auto">
      <table className="data-table w-full text-sm">
        <thead>
          <tr><th>Meeting</th><th className="text-right">Races</th><th className="text-right">Benchmarked</th><th className="text-right">Bias</th><th className="text-right">Spread</th><th className="text-right">Vs field</th><th className="text-right">Fit</th><th className="text-right">Winner in our four</th><th className="text-right">Top rated won</th><th className="text-right">Top rated placed</th><th className="text-right">Bets</th><th className="text-right">Lays</th></tr>
        </thead>
        <tbody>
          {review.meetings.map((m) => {
            const share = m.runners ? Math.round((100 * m.full) / m.runners) : 0;
            return (
              <tr key={m.meeting.meetingId} className={share < 50 ? "text-ink-soft" : ""}>
                <td className="font-semibold"><a href={`#m-${m.meeting.meetingId}`} className="underline">{m.meeting.track}</a> <span className="text-ink-soft font-normal text-xs">{m.meeting.state}</span></td>
                <td className="text-right nums">{m.races}</td>
                <td className="text-right nums">{m.full}/{m.runners} <span className="text-ink-soft">({share}%)</span></td>
                <td className={`text-right nums ${gapClass(m.bias)}`}>{signed(m.bias)}</td>
                <td className="text-right nums">{m.spread?.toFixed(1) ?? ""}</td>
                <td className="text-right nums">{m.relSpread?.toFixed(1) ?? ""}</td>
                <td className="text-right nums">{m.fit?.toFixed(2) ?? ""}</td>
                <td className="text-right nums">{m.resulted ? `${m.winnersInFour}/${m.resulted}` : ""}</td>
                <td className="text-right nums">{m.resulted ? `${m.topRatedWon}/${m.resulted}` : ""}</td>
                <td className="text-right nums">{m.resulted ? `${m.topRatedPlaced}/${m.resulted}` : ""}</td>
                <td className={`text-right nums ${unitsClass(m.betUnits)}`}>{m.bets ? `${m.bets} · ${signed(m.betUnits, 2)}` : ""}</td>
                <td className={`text-right nums ${unitsClass(m.layUnits)}`}>{m.lays ? `${m.lays} · ${signed(m.layUnits, 2)}` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </Section>
  );
}

function Ranking({ review }: { review: Review }) {
  return (
    <Section id="review-ranking" letter="S" title="Races by how strongly they were run" aside="Strength is the first three home against the class benchmark, in lengths; tempo is the leader's first section against class" defaultOpen={false}>
      <div className="overflow-x-auto">
      <table className="data-table w-full text-sm">
        <thead>
          <tr><th>#</th><th>Race</th><th>Class</th><th className="text-right">Par</th><th className="text-right">Strength</th><th className="text-right">Winner ran to</th><th>Winner</th><th>Tempo</th><th className="text-right">Leader early</th><th>Our call</th><th className="text-right">Benchmarked</th></tr>
        </thead>
        <tbody>
          {review.ranking.map((r, i) => {
            const winner = r.runners.find((x) => x.finish === 1);
            const ours = r.runners.filter((x) => x.runner.signal);
            return (
              <ClickRow key={r.race.raceId} href={reviewHref(r, review.date)}>
                <td className="nums">{i + 1}</td>
                <td><Link href={reviewHref(r, review.date)} className="underline">{raceLabel(r)}</Link> <span className="text-ink-soft">{r.race.name}</span></td>
                <td>{r.race.className ?? ""} {r.race.distance}m</td>
                <td className="text-right nums">{r.race.classPoints}</td>
                <td className="text-right nums font-semibold">{signed(r.strength)}L</td>
                <td className="text-right nums">{r.winnerRanTo?.toFixed(1) ?? ""}</td>
                <td>{winner ? `${winner.runner.tabNumber}. ${winner.runner.horseName}` : ""}{winner?.runner.rank ? <span className="text-ink-soft"> (our #{winner.runner.rank})</span> : ""}</td>
                <td>{r.tempo ?? ""}</td>
                <td className="text-right nums">{signed(r.leaderEarly)}L</td>
                <td className="text-xs">{ours.map((x) => `${x.runner.signal === "lay" ? "Lay" : "Bet"} ${x.runner.horseName} ${finish(x)}`).join(", ")}</td>
                <td className="text-right nums">{r.full}/{r.runners.length}</td>
              </ClickRow>
            );
          })}
          {review.ranking.length === 0 && <tr><td colSpan={11} className="text-ink-soft">No race has a benchmarked placegetter yet.</td></tr>}
        </tbody>
      </table>
      </div>
    </Section>
  );
}

function Runs({ title, rows, date, late }: { title: string; rows: (ReviewedRunner & { race: ReviewedRace })[]; date: string; late?: boolean }) {
  return (
    <div className="card mb-4 overflow-x-auto">
      <h2 className="font-display font-extrabold mb-3">{title}</h2>
      <table className="data-table w-full text-sm">
        <thead>
          <tr><th>Horse</th><th>Race</th><th>Result</th><th className="text-right">{late ? "Last 600" : "Vs class"}</th><th className="text-right">Ran to</th><th className="text-right">Our mark</th><th className="text-right">Gap</th><th className="text-right">Vs field</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ClickRow key={`${r.race.race.raceId}:${r.runner.tabNumber}`} href={reviewHref(r.race, date)}>
              <td className="font-semibold">{r.runner.horseName}{r.runner.signal ? <span className="text-ink-soft text-xs"> {r.runner.signal === "lay" ? "lay" : "bet"}</span> : ""}</td>
              <td><Link href={reviewHref(r.race, date)} className="underline">{raceLabel(r.race)}</Link></td>
              <td className="nums">{finish(r)}</td>
              <td className="text-right nums font-semibold">{signed(late ? r.late : r.run?.vsClass)}L{late && r.run?.last600 ? <span className="text-ink-soft font-normal"> {r.run.last600.toFixed(2)}s</span> : ""}</td>
              <td className="text-right nums">{r.ranTo?.toFixed(1) ?? ""}</td>
              <td className="text-right nums">{r.runner.ratings.today.toFixed(1)}</td>
              <td className={`text-right nums ${gapClass(r.gap)}`}>{signed(r.gap)}</td>
              <td className={`text-right nums ${gapClass(r.relGap)}`}>{signed(r.relGap)}</td>
            </ClickRow>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="text-ink-soft">Nothing benchmarked yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Races({ review }: { review: Review }) {
  const meetings = new Map<string, ReviewedRace[]>();
  for (const r of review.races) {
    if (!r.wanted) continue;
    const list = meetings.get(r.meeting.meetingId) ?? [];
    list.push(r);
    meetings.set(r.meeting.meetingId, list);
  }
  const order = new Map(review.meetings.map((m, i) => [m.meeting.meetingId, i]));
  return (
    <>
      <Section id="review-races" letter="R" title="Races by meeting" aside="Click a race for the race as a whole">
      {[...meetings.values()]
        .sort((a, b) => (order.get(a[0].meeting.meetingId) ?? 99) - (order.get(b[0].meeting.meetingId) ?? 99))
        .map((races) => (
          <section key={races[0].meeting.meetingId} id={`m-${races[0].meeting.meetingId}`} className="mb-5 overflow-x-auto scroll-mt-40">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
              <h3 className="font-display font-extrabold">{races[0].meeting.track} <span className="text-ink-soft font-normal text-sm">{races[0].meeting.state}</span></h3>
              <span className="nums text-sm text-ink-soft">{races.reduce((a, r) => a + r.full, 0)} of {races.reduce((a, r) => a + r.runners.length, 0)} runners benchmarked</span>
            </div>
            <table className="data-table w-full text-sm">
              <thead>
                <tr><th>Race</th><th>Class</th><th className="text-right">Par</th><th className="text-right">Strength</th><th>Tempo</th><th className="text-right">Leader early</th><th>Winner</th><th className="text-right">Ran to</th><th className="text-right">Bias</th><th className="text-right">Spread</th><th>Our calls</th><th className="text-right">Benchmarked</th></tr>
              </thead>
              <tbody>
                {races.map((r) => {
                  const winner = r.runners.find((x) => x.finish === 1);
                  const ours = r.runners.filter((x) => x.runner.signal);
                  return (
                    <ClickRow key={r.race.raceId} href={reviewHref(r, review.date)}>
                      <td><Link href={reviewHref(r, review.date)} className="underline font-semibold">R{r.race.raceNumber}</Link> <span className="text-ink-soft">{r.race.name}</span></td>
                      <td>{r.race.className ?? ""} {r.race.distance}m</td>
                      <td className="text-right nums">{r.race.classPoints}</td>
                      <td className="text-right nums font-semibold">{r.strength !== undefined ? `${signed(r.strength)}L` : ""}{(r.strength ?? 0) >= 5 && <span className="badge badge-lay ml-1" title="The first three all ran five lengths or more above class: the benchmark has not settled">suspect</span>}</td>
                      <td>{r.tempo ?? ""}</td>
                      <td className="text-right nums">{r.leaderEarly !== undefined ? `${signed(r.leaderEarly)}L` : ""}</td>
                      <td>{winner ? `${winner.runner.tabNumber}. ${winner.runner.horseName}` : ""}{winner?.runner.rank ? <span className="text-ink-soft"> (our #{winner.runner.rank})</span> : ""}</td>
                      <td className="text-right nums">{r.winnerRanTo?.toFixed(1) ?? ""}</td>
                      <td className={`text-right nums ${gapClass(r.bias)}`}>{signed(r.bias)}</td>
                      <td className="text-right nums">{r.spread?.toFixed(1) ?? ""}</td>
                      <td className="text-xs">{ours.map((x) => `${x.runner.signal === "lay" ? "Lay" : "Bet"} ${x.runner.horseName} ${finish(x)}`).join(", ")}</td>
                      <td className="text-right nums">{r.full}/{r.runners.length}</td>
                    </ClickRow>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </Section>
    </>
  );
}
