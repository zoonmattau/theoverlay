import Link from "next/link";
import { Suspense } from "react";

import { GoingsTable, PeopleTable, TrackDistancesTable, TrackShapeTable, TrackTempoTable, UpcomingRacesTable } from "@/components/HubTables";
import { filterQuery } from "@/lib/data/filters";
import { hubGoings, hubPeople, hubTrackDistances, hubTrackExtra, hubTracks } from "@/lib/data/hub";
import { upcomingRaces } from "@/lib/data/upcoming";
import { HubLocked, hubViewer } from "../../shared";

export default function Page({ params }: PageProps<"/data/tracks/[track]">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <TrackPage params={params} />
    </Suspense>
  );
}

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * One track, for someone who has just clicked it off a runner or a ranking:
 * how quick it is, what the standard times are, how races are run there and
 * who wins them, who rides and trains well there, and what is on there next.
 */
async function TrackPage({ params }: { params: PageProps<"/data/tracks/[track]">["params"] }) {
  const [{ open }, { track }] = await Promise.all([hubViewer(), params]);
  const slug = decodeURIComponent(track);
  if (!open) return <HubLocked what="Track pages" />;
  const tracks = await hubTracks();
  const t = tracks.find((x) => norm(x.track) === norm(slug));
  if (!t) return <section className="py-6"><p className="text-sm text-ink-soft">No timed runs at that track. <Link href="/data/tracks" className="text-blue">All tracks</Link>.</p></section>;
  const [all, extra, jockeys, trainers, races, goings] = await Promise.all([
    hubTrackDistances(), hubTrackExtra(t.track), hubPeople("jockey", { tracks: [t.track] }), hubPeople("trainer", { tracks: [t.track] }), upcomingRaces({ track: t.track }), hubGoings(),
  ]);
  const distances = all.filter((r) => r.track === t.track);
  const wet = goings.filter((g) => g.track === t.track);
  const signed = (v: number | null, unit = "") => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}${unit}`);
  const verdict = t.speed === null ? "not enough runs to say how quick it is" : t.speed >= 1 ? `a quick track, ${t.speed.toFixed(1)} lengths under the typical time over its distances` : t.speed <= -1 ? `a slow track, ${Math.abs(t.speed).toFixed(1)} lengths over the typical time over its distances` : "runs close to the typical time over its distances";
  const front = extra.shapes.filter((s) => s.frontRunnerWinPct !== null && (s.races ?? 0) >= 30);
  const leaders = front.length ? front.reduce((a, s) => a + s.frontRunnerWinPct! * (s.races ?? 0), 0) / front.reduce((a, s) => a + (s.races ?? 0), 0) : null;
  return (
    <section className="py-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{t.track}{t.state ? `, ${t.state}` : ""}</h2>
          <Link href={`/data/tracks?find=${encodeURIComponent(t.track)}`} className="badge badge-muted">in the track list</Link>
        </div>
        <p className="mt-1 text-sm text-ink-secondary">
          {t.runs.toLocaleString("en-AU")} timed runs over {t.distances} distances: {verdict}.{leaders !== null ? ` The front runner wins ${leaders.toFixed(0)}% of races here.` : ""}
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <Stat n={signed(t.speed, "L")} label="speed v typical" tone={t.speed === null ? undefined : t.speed > 0 ? "prime" : "lay"} />
          <Stat n={extra.speedIndex === null ? "—" : signed(-extra.speedIndex)} label="HorseEdge index" sub="plus is quick" tone={extra.speedIndex === null ? undefined : extra.speedIndex < 0 ? "prime" : "lay"} />
          <Stat n={signed(t.vsBench, "L")} label="feed benchmark" sub="runs v class here" />
          <Stat n={leaders === null ? "—" : `${leaders.toFixed(0)}%`} label="front runner wins" />
          <Stat n={String(t.races.toLocaleString("en-AU"))} label="races timed" />
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">On here next</h3>
        {races.length === 0 ? <p className="text-sm text-ink-soft">Nothing at {t.track} on today&apos;s or tomorrow&apos;s card.</p> : <UpcomingRacesTable rows={races} />}
      </div>

      <div>
        <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Standard times</h3>
        <p className="mb-2 text-sm text-ink-secondary">By distance: the typical time, the quickest, and the typical time on each going. Click a distance for its page.</p>
        <TrackDistancesTable rows={distances} track={t.track} />
      </div>

      {wet.length > 0 && (
        <div id="going">
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">What the going costs here</h3>
          <p className="mb-2 text-sm text-ink-secondary">
            Soft and heavy against good, trip by trip. Who handles it: <Link href={`/data/jockeys${filterQuery({ tracks: [t.track], goings: [5, 6, 7] })}`} className="text-blue">jockeys on soft here</Link>, <Link href={`/data/jockeys${filterQuery({ tracks: [t.track], goings: [8, 9, 10] })}`} className="text-blue">on heavy</Link>, <Link href={`/data/trainers${filterQuery({ tracks: [t.track], goings: [8, 9, 10] })}`} className="text-blue">trainers on heavy</Link>.
          </p>
          <GoingsTable rows={wet} />
        </div>
      )}

      {extra.shapes.length > 0 && (
        <div id="shape">
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">How races are run here</h3>
          <p className="mb-2 text-sm text-ink-secondary">From HorseEdge&apos;s sectionals: how much of the race is run early, mid and late over each trip, and how often the horse that led won or held a place, one row a race. A trip where the leader wins often is a trip to be on the speed.</p>
          <TrackShapeTable rows={extra.shapes} />
        </div>
      )}

      {extra.tempo.length > 0 && (
        <div id="tempo">
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Tempo and the finish</h3>
          <p className="mb-2 text-sm text-ink-secondary">Typical early, middle and last-600 times by trip and going, and what a second of early tempo costs the last 600 here.</p>
          <TrackTempoTable rows={extra.tempo} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Jockeys here</h3>
          <p className="mb-2 text-sm text-ink-secondary">Ranked on Power at this track. <Link href={`/data/jockeys${filterQuery({ tracks: [t.track] })}`} className="text-blue">Full list with filters</Link>, <Link href={`/data/combos${filterQuery({ tracks: [t.track] })}`} className="text-blue">pairs here</Link>.</p>
          <PeopleTable rows={jockeys.slice(0, 200)} what="rider" filtered compact />
        </div>
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Trainers here</h3>
          <p className="mb-2 text-sm text-ink-secondary">Ranked on Power at this track. <Link href={`/data/trainers${filterQuery({ tracks: [t.track] })}`} className="text-blue">Full list with filters</Link>.</p>
          <PeopleTable rows={trainers.slice(0, 200)} what="stable" filtered compact />
        </div>
      </div>
    </section>
  );
}

function Stat({ n, label, sub, tone }: { n: string; label: string; sub?: string; tone?: "prime" | "lay" }) {
  return (
    <div className="card py-3 text-center">
      <div className={`font-display font-extrabold text-xl nums ${tone === "prime" ? "text-accent" : tone === "lay" ? "text-red" : ""}`}>{n}</div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">{label}</div>
      {sub && <div className="text-xs text-ink-soft nums">{sub}</div>}
    </div>
  );
}
