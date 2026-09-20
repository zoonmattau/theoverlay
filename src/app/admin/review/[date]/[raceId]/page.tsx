import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { buildReview } from "@/lib/model/review";
import { RaceBody, RaceLine } from "../../RaceBody";
import { RaceStrip, type StripRace } from "../../RaceStrip";
import { dayLabel, raceHref, reviewHref } from "../../shared";

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

/** One race as a whole: how it was run, how our marks and calls went, and every runner against its run. */
async function Race({ params }: { params: PageProps<"/admin/review/[date]/[raceId]">["params"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const { date, raceId } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const review = await buildReview(date);
  const r = review?.races.find((x) => x.race.raceId === raceId);
  if (!review || !r) notFound();
  // Every race the review wants, in meeting order, for the strip.
  const order = new Map(review.meetings.map((m, i) => [m.meeting.meetingId, i]));
  const strip: StripRace[] = review.races
    .filter((x) => x.wanted || x.race.raceId === raceId)
    .sort((a, b) => (order.get(a.meeting.meetingId) ?? 99) - (order.get(b.meeting.meetingId) ?? 99) || a.race.raceNumber - b.race.raceNumber)
    .map((x) => ({
      raceId: x.race.raceId,
      href: reviewHref(x, date),
      track: x.meeting.track,
      raceNumber: x.race.raceNumber,
      name: x.race.name,
      full: x.full,
      runners: x.runners.length,
      fetched: x.runners.filter((y) => y.run !== undefined).length,
    }));

  return (
    <>
      <RaceStrip races={strip} current={raceId} />
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold">
          <Link href="/admin/review" className="underline">Weekly review</Link> · <Link href={`/admin/review/${date}`} className="underline">{dayLabel(date)}</Link> ·{" "}
          <a href={`/admin/review/${date}#m-${r.meeting.meetingId}`} className="underline">{r.meeting.track}</a>
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          {r.meeting.track} R{r.race.raceNumber} <span className="text-ink-soft font-bold">{r.race.name}</span>
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          <RaceLine r={r} /> <Link href={raceHref(r, date)} className="underline">The public page</Link>.
        </p>
      </section>
      <RaceBody review={review} r={r} />
    </>
  );
}
