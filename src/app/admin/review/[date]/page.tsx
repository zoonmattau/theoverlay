import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { buildReview, type LedgerRow, type Review, type ReviewedRace, type ReviewedRunner } from "@/lib/model/review";
import { FetchButton } from "../FetchButton";

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

const label = (date: string) => new Date(`${date}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const signed = (n: number | undefined, dp = 1) => (n === undefined || Number.isNaN(n) ? "" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dp)}`);
const price = (n?: number) => (n ? `$${n.toFixed(2)}` : "");
const finish = (r: { finish?: number; margin?: number }) => (r.finish === undefined ? "" : r.finish === 0 ? "DNF" : r.finish === 1 ? "Won" : `${r.finish}${r.margin !== undefined ? ` (${r.margin.toFixed(1)}L)` : ""}`);
const STAGE: Record<string, string> = {
  FULL_SECTIONAL_DATA: "Full",
  OVERALL_AND_600_SECTIONAL: "Time and last 600",
  OVERALL_TIME_ONLY: "Time only",
  SECT_NO_BM: "Sectionals, no benchmark yet",
  NONE: "Nothing yet",
  NOT_FOUND: "Run not found",
};
const stageOf = (r: ReviewedRunner) => (r.run === undefined ? "Not fetched" : r.run === null ? "Run not found" : (STAGE[r.run.stage] ?? r.run.stage));
const raceHref = (r: ReviewedRace, date: string) => `/racing/${date}/${r.meeting.meetingId}/${r.race.raceId}`;
const raceLabel = (r: ReviewedRace) => `${r.meeting.track} R${r.race.raceNumber}`;

/** Tone for a gap between the run and our mark: a length either way is noise. */
const gapClass = (gap?: number) => (gap === undefined ? "" : gap >= 2 ? "text-emerald-700 font-semibold" : gap <= -2 ? "text-red-700 font-semibold" : "");

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
    <div className="card mb-4 overflow-x-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display font-extrabold">{title}</h2>
        <span className="nums text-sm text-ink-soft">
          {rows.length} calls, {won} of {settled.length} won, {signed(units)}u{meanGap !== undefined ? `, ran ${signed(meanGap)} against our marks on average` : ""}
        </span>
      </div>
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
            <tr key={`${r.race.raceId}:${r.runner.tabNumber}`}>
              <td><Link href={`/racing/${date}/${r.meeting.meetingId}/${r.race.raceId}`} className="underline">{r.meeting.track} R{r.race.raceNumber}</Link></td>
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
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={15} className="text-ink-soft">None on the card.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Tag({ tag, side, prime }: { tag?: string; side: "back" | "lay"; prime?: boolean }) {
  if (side === "lay") return <span className="badge badge-lay">Lay</span>;
  if (prime || tag === "prime_overlay" || tag === "top_overlay") return <span className="badge badge-prime">{tag === "top_overlay" ? "Overlay of the Day" : "Prime Overlay"}</span>;
  if (tag === "long_overlay") return <span className="badge badge-back">Long Overlay</span>;
  return <span className="badge badge-back">Bet</span>;
}

function Ranking({ review }: { review: Review }) {
  return (
    <div className="card mb-4 overflow-x-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display font-extrabold">Races by how strongly they were run</h2>
        <span className="text-sm text-ink-soft">Strength is the first three home against the class benchmark, in lengths. Tempo is the leader&apos;s first section against class.</span>
      </div>
      <table className="data-table w-full text-sm">
        <thead>
          <tr><th>#</th><th>Race</th><th>Class</th><th className="text-right">Par</th><th className="text-right">Strength</th><th className="text-right">Winner ran to</th><th>Winner</th><th>Tempo</th><th className="text-right">Leader early</th><th>Our call</th><th className="text-right">Benchmarked</th></tr>
        </thead>
        <tbody>
          {review.ranking.map((r, i) => {
            const winner = r.runners.find((x) => x.finish === 1);
            const ours = r.runners.filter((x) => x.runner.signal);
            return (
              <tr key={r.race.raceId}>
                <td className="nums">{i + 1}</td>
                <td><Link href={raceHref(r, review.date)} className="underline">{raceLabel(r)}</Link> <span className="text-ink-soft">{r.race.name}</span></td>
                <td>{r.race.className ?? ""} {r.race.distance}m</td>
                <td className="text-right nums">{r.race.classPoints}</td>
                <td className="text-right nums font-semibold">{signed(r.strength)}L</td>
                <td className="text-right nums">{r.winnerRanTo?.toFixed(1) ?? ""}</td>
                <td>{winner ? `${winner.runner.tabNumber}. ${winner.runner.horseName}` : ""}{winner?.runner.rank ? <span className="text-ink-soft"> (our #{winner.runner.rank})</span> : ""}</td>
                <td>{r.tempo ?? ""}</td>
                <td className="text-right nums">{signed(r.leaderEarly)}L</td>
                <td className="text-xs">{ours.map((x) => `${x.runner.signal === "lay" ? "Lay" : "Bet"} ${x.runner.horseName} ${finish(x)}`).join(", ")}</td>
                <td className="text-right nums">{r.full}/{r.runners.length}</td>
              </tr>
            );
          })}
          {review.ranking.length === 0 && <tr><td colSpan={11} className="text-ink-soft">No race has a benchmarked placegetter yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Runs({ title, rows, date, late }: { title: string; rows: (ReviewedRunner & { race: ReviewedRace })[]; date: string; late?: boolean }) {
  return (
    <div className="card mb-4 overflow-x-auto">
      <h2 className="font-display font-extrabold mb-3">{title}</h2>
      <table className="data-table w-full text-sm">
        <thead>
          <tr><th>Horse</th><th>Race</th><th>Result</th><th className="text-right">{late ? "Last 600" : "Vs class"}</th><th className="text-right">Ran to</th><th className="text-right">Our mark</th><th className="text-right">Gap</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.race.race.raceId}:${r.runner.tabNumber}`}>
              <td className="font-semibold">{r.runner.horseName}{r.runner.signal ? <span className="text-ink-soft text-xs"> {r.runner.signal === "lay" ? "lay" : "bet"}</span> : ""}</td>
              <td><Link href={raceHref(r.race, date)} className="underline">{raceLabel(r.race)}</Link></td>
              <td className="nums">{finish(r)}</td>
              <td className="text-right nums font-semibold">{signed(late ? r.late : r.run?.vsClass)}L{late && r.run?.last600 ? <span className="text-ink-soft font-normal"> {r.run.last600.toFixed(2)}s</span> : ""}</td>
              <td className="text-right nums">{r.ranTo?.toFixed(1) ?? ""}</td>
              <td className="text-right nums">{r.runner.ratings.today.toFixed(1)}</td>
              <td className={`text-right nums ${gapClass(r.gap)}`}>{signed(r.gap)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="text-ink-soft">Nothing benchmarked yet.</td></tr>}
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
  return (
    <>
      <h2 className="font-display text-xl font-extrabold mt-8 mb-3">Every race</h2>
      {[...meetings.values()].map((races) => (
        <details key={races[0].meeting.meetingId} className="card mb-3">
          <summary className="cursor-pointer flex flex-wrap items-baseline justify-between gap-3">
            <span className="font-display font-extrabold">{races[0].meeting.track} <span className="text-ink-soft font-normal text-sm">{races[0].meeting.state}</span></span>
            <span className="nums text-sm text-ink-soft">{races.reduce((a, r) => a + r.full, 0)} of {races.reduce((a, r) => a + r.runners.length, 0)} runners benchmarked</span>
          </summary>
          {races.map((r) => (
            <div key={r.race.raceId} className="mt-4 overflow-x-auto">
              <h3 className="font-semibold text-sm mb-1">
                <Link href={raceHref(r, review.date)} className="underline">R{r.race.raceNumber} {r.race.name}</Link>
                <span className="text-ink-soft font-normal"> {r.race.className ?? ""} {r.race.distance}m, par {r.race.classPoints}{r.tempo ? `, ${r.tempo} tempo` : ""}{r.strength !== undefined ? `, ${signed(r.strength)}L strength` : ""}</span>
              </h3>
              <table className="data-table w-full text-sm">
                <thead>
                  <tr><th>Result</th><th>Horse</th><th>Ours</th><th className="text-right">Our mark</th><th className="text-right">Ran to</th><th className="text-right">Gap</th><th className="text-right">Vs class</th><th className="text-right">Early</th><th className="text-right">Last 600</th><th className="text-right">Fin. speed</th><th className="text-right">Settled</th><th className="text-right">SP</th><th>Data</th></tr>
                </thead>
                <tbody>
                  {r.runners.map((x) => (
                    <tr key={x.runner.tabNumber}>
                      <td className="nums">{finish(x)}</td>
                      <td className="font-semibold">{x.runner.tabNumber}. {x.runner.horseName}</td>
                      <td className="text-xs">{x.runner.signal ? <Tag side={x.runner.signal} prime={x.runner.prime} /> : x.runner.rank ? <span className="text-ink-soft">#{x.runner.rank}</span> : ""}</td>
                      <td className="text-right nums">{x.runner.ratings.today.toFixed(1)}</td>
                      <td className="text-right nums">{x.ranTo?.toFixed(1) ?? ""}</td>
                      <td className={`text-right nums ${gapClass(x.gap)}`}>{signed(x.gap)}</td>
                      <td className="text-right nums">{signed(x.run?.vsClass)}</td>
                      <td className="text-right nums">{signed(x.early)}</td>
                      <td className="text-right nums">{signed(x.late)}{x.lateRank ? ` (${x.lateRank})` : ""}{x.run?.last600 ? <span className="text-ink-soft"> {x.run.last600.toFixed(2)}</span> : ""}</td>
                      <td className="text-right nums">{x.run?.finishingSpeed ? `${x.run.finishingSpeed.toFixed(1)}%` : ""}</td>
                      <td className="text-right nums">{x.run?.posSettling ?? ""}</td>
                      <td className="text-right nums">{price(x.sp)}</td>
                      <td className="text-ink-soft text-xs">{stageOf(x)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </details>
      ))}
    </>
  );
}
