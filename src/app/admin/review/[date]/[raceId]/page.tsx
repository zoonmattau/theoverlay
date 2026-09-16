import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { buildReview } from "@/lib/model/review";
import { settle } from "@/lib/tips";
import { dayLabel, finish, gapClass, price, raceHref, RunnerTable, signed, Tag, unitsClass } from "../../shared";

export const metadata: Metadata = { title: "Race review", robots: { index: false } };

export default function Page({ params }: PageProps<"/admin/review/[date]/[raceId]">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Race params={params} />
      </Suspense>
    </div>
  );
}

function Stat({ label, value, sub, className = "" }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="card py-3">
      <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft">{label}</div>
      <div className={`nums text-2xl font-extrabold ${className}`}>{value || "—"}</div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
    </div>
  );
}

/** One race as a whole: how it was run, how our marks and calls went, and every runner against its run. */
async function Race({ params }: { params: PageProps<"/admin/review/[date]/[raceId]">["params"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const { date, raceId } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const review = await buildReview(date);
  const r = review?.races.find((x) => x.race.raceId === raceId);
  if (!review || !r) notFound();
  const winner = r.runners.find((x) => x.finish === 1);
  const topRated = [...r.runners].sort((a, b) => b.runner.ratings.today - a.runner.ratings.today)[0];
  const calls = r.runners.filter((x) => x.runner.signal && x.runner.marketPrice);
  const settled = calls.filter((x) => x.finish !== undefined);
  const units = settled.reduce((a, x) => a + settle(x.runner.signal!, x.runner.marketPrice!, x.finish!), 0);
  const ours = r.runners.filter((x) => x.runner.rank).sort((a, b) => a.runner.rank! - b.runner.rank!);
  const talking = review.talking.filter((t) => t.runner.race.race.raceId === raceId);

  return (
    <>
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold">
          <Link href="/admin/review" className="underline">Weekly review</Link> · <Link href={`/admin/review/${date}`} className="underline">{dayLabel(date)}</Link> ·{" "}
          <a href={`/admin/review/${date}#m-${r.meeting.meetingId}`} className="underline">{r.meeting.track}</a>
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          {r.meeting.track} R{r.race.raceNumber} <span className="text-ink-soft font-bold">{r.race.name}</span>
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {r.race.className ?? ""} {r.race.distance}m, par {r.race.classPoints}{r.race.goingText ? `, ${r.race.goingText}` : ""}. {r.full} of {r.runners.length} runners with a full benchmark.{" "}
          <Link href={raceHref(r, date)} className="underline">The public page</Link>.
        </p>
      </section>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7 mb-4">
        <Stat label="Strength" value={r.strength !== undefined ? `${signed(r.strength)}L` : ""} sub="first three vs class" />
        <Stat label="Tempo" value={r.tempo ?? ""} sub={r.leaderEarly !== undefined ? `leader ${signed(r.leaderEarly)}L early` : undefined} />
        <Stat label="Winner ran to" value={r.winnerRanTo?.toFixed(1) ?? ""} sub={winner ? `${winner.runner.horseName}${winner.runner.rank ? `, our #${winner.runner.rank}` : ", not in our four"}` : undefined} />
        <Stat label="Bias" value={signed(r.bias)} sub="ran-to minus our mark" className={gapClass(r.bias)} />
        <Stat label="Spread" value={r.spread?.toFixed(1) ?? ""} sub="mean gap either way" />
        <Stat label="Top rated" value={topRated ? finish(topRated) : ""} sub={topRated ? `${topRated.runner.horseName} at ${topRated.runner.ratings.today.toFixed(1)}` : undefined} />
        <Stat label="Our calls" value={settled.length ? signed(units, 2) : ""} sub={calls.length ? `${calls.length} ${calls.length === 1 ? "call" : "calls"}, level stakes` : "none"} className={unitsClass(settled.length ? units : undefined)} />
      </div>

      {talking.length > 0 && (
        <div className="card mb-4 text-sm space-y-2">
          {talking.map((t, i) => (
            <p key={i}>
              <span className="badge mr-2">{t.kind}</span>
              {t.text}
            </p>
          ))}
        </div>
      )}

      <div className="card mb-4 overflow-x-auto">
        <h2 className="font-display font-extrabold mb-2">Our top four and calls</h2>
        <table className="data-table w-full text-sm">
          <thead>
            <tr><th>#</th><th>Horse</th><th>Call</th><th className="text-right">Our mark</th><th className="text-right">Rated</th><th className="text-right">Market</th><th className="text-right">Edge</th><th>Result</th><th className="text-right">Ran to</th><th className="text-right">Gap</th><th>Why</th></tr>
          </thead>
          <tbody>
            {ours.map((x) => (
              <tr key={x.runner.tabNumber}>
                <td className="nums">{x.runner.rank}</td>
                <td className="font-semibold">{x.runner.tabNumber}. {x.runner.horseName}</td>
                <td>{x.runner.signal ? <Tag side={x.runner.signal} prime={x.runner.prime} /> : ""}</td>
                <td className="text-right nums">{x.runner.ratings.today.toFixed(1)}</td>
                <td className="text-right nums">{price(x.runner.ratedPrice)}</td>
                <td className="text-right nums">{price(x.runner.marketPrice)}</td>
                <td className="text-right nums">{x.runner.edge !== undefined ? `${signed(x.runner.edge * 100)}%` : ""}</td>
                <td className="nums">{finish(x)}</td>
                <td className="text-right nums">{x.ranTo?.toFixed(1) ?? ""}</td>
                <td className={`text-right nums ${gapClass(x.gap)}`}>{signed(x.gap)}</td>
                <td className="text-xs text-ink-soft">{x.runner.why ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mb-4 overflow-x-auto">
        <h2 className="font-display font-extrabold mb-2">Every runner against its run</h2>
        <RunnerTable r={r} />
      </div>
    </>
  );
}
