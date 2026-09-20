import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Section } from "@/components/Section";
import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { buildReview, type Review, type ReviewedRace } from "@/lib/model/review";
import { RaceBody, RaceLine } from "../../RaceBody";
import { dayLabel, finish, raceHref, raceLabel, reviewHref, signed } from "../../shared";

export const metadata: Metadata = { title: "Review story", robots: { index: false } };

export default function Page({ params }: PageProps<"/admin/review/[date]/story">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Story params={params} />
      </Suspense>
    </div>
  );
}

interface StoryRace {
  r: ReviewedRace;
  /** Why the race is in the story, in the order the reasons were found. */
  why: string[];
}

/**
 * The races worth talking about, in the order a review would take them:
 * the talking points first, then the features by grade, then every race
 * with a bet, then every race with a lay. A race appears once, with every
 * reason it earned.
 */
function storyRaces(review: Review): StoryRace[] {
  const out = new Map<string, StoryRace>();
  const add = (r: ReviewedRace, why: string) => {
    const s = out.get(r.race.raceId) ?? { r, why: [] };
    if (!s.why.includes(why)) s.why.push(why);
    out.set(r.race.raceId, s);
  };
  for (const t of review.talking) add(t.runner.race, `${t.kind}: ${t.runner.runner.horseName}`);
  for (const f of review.features) add(f.race, f.grade);
  for (const b of review.bets) add(b.reviewed, `${b.tag === "prime_overlay" ? "Prime" : b.tag === "long_overlay" ? "Long" : "Bet"} ${b.runner.horseName} ${finish(b) || "to run"}${b.units !== undefined ? `, ${signed(b.units, 2)}u` : ""}`);
  for (const l of review.lays) add(l.reviewed, `Lay ${l.runner.horseName} ${finish(l) || "to run"}${l.units !== undefined ? `, ${signed(l.units, 2)}u` : ""}`);
  for (const c of review.closers.slice(0, 5)) add(c.race, `fastest last 600: ${c.runner.horseName}`);
  return [...out.values()];
}

async function Story({ params }: { params: PageProps<"/admin/review/[date]/story">["params"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const review = await buildReview(date);
  if (!review) notFound();
  const races = storyRaces(review);
  const bets = review.bets.filter((b) => b.units !== undefined);
  const lays = review.lays.filter((l) => l.units !== undefined);
  const sum = (rows: { units?: number }[]) => rows.reduce((a, r) => a + (r.units ?? 0), 0);

  return (
    <>
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold">
          <Link href="/admin/review" className="underline">Weekly review</Link> · <Link href={`/admin/review/${date}`} className="underline">{dayLabel(date)}</Link>
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">The story of {dayLabel(date)}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {review.bets.length} bets, {bets.filter((b) => b.units! > 0).length} of {bets.length} won, {signed(sum(bets), 2)}u. {review.lays.length} lays, {lays.filter((l) => l.units! > 0).length} of {lays.length} held, {signed(sum(lays), 2)}u.
          {" "}{races.length} races to talk about: the talking points, then the features, then every bet and lay. Each race folds up once you are done with it.
        </p>
      </section>

      <nav className="card mb-4 text-sm">
        <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 list-decimal list-inside">
          {races.map(({ r, why }) => (
            <li key={r.race.raceId}>
              <a href={`#story-${r.race.raceId}`} className="font-semibold underline">{raceLabel(r)}</a>
              <span className="text-ink-soft"> {why[0]}</span>
            </li>
          ))}
        </ol>
      </nav>

      {races.map(({ r, why }, i) => (
        <div key={r.race.raceId} id={`story-${r.race.raceId}`} className="scroll-mt-4">
          <Section
            className="mb-4"
            id={`story-race-${r.race.raceId}`}
            letter={String(i + 1)}
            title={<>{raceLabel(r)} <span className="text-ink-soft font-bold">{r.race.name}</span></>}
            aside={why.join(" · ")}
          >
            <div className="section-body">
              <p className="mb-4 text-sm text-ink-soft">
                <RaceLine r={r} /> <Link href={reviewHref(r, date)} className="underline">The race page</Link>. <Link href={raceHref(r, date)} className="underline">The public page</Link>.
              </p>
              <RaceBody review={review} r={r} />
            </div>
          </Section>
        </div>
      ))}
      {races.length === 0 && <div className="card text-sm text-ink-soft">Nothing to talk about yet: fetch the runs first.</div>}
    </>
  );
}
