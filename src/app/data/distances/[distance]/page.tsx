import Link from "next/link";
import { Suspense } from "react";

import { DistanceShapeTable, DistanceTracksTable, PeopleTable, UpcomingRacesTable } from "@/components/HubTables";
import { filterQuery } from "@/lib/data/filters";
import { clock, hubDistanceShapes, hubDistances, hubPeople, hubTrackDistances } from "@/lib/data/hub";
import { upcomingRaces } from "@/lib/data/upcoming";
import { HubLocked, hubViewer } from "../../shared";

export default function Page({ params }: PageProps<"/data/distances/[distance]">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <DistancePage params={params} />
    </Suspense>
  );
}

/**
 * One distance: the typical time and the record, which tracks run it quick
 * and slow, where the leaders win over it and where the closers do, who
 * rides and trains well over the trip, and what is on over it next.
 */
async function DistancePage({ params }: { params: PageProps<"/data/distances/[distance]">["params"] }) {
  const [{ open }, p] = await Promise.all([hubViewer(), params]);
  const distance = Number(p.distance);
  if (!open) return <HubLocked what="Distance pages" />;
  const distances = await hubDistances();
  const d = distances.find((x) => x.distance === distance);
  if (!d) return <section className="py-6"><p className="text-sm text-ink-soft">No timed runs over that distance. <Link href="/data/distances" className="text-blue">All distances</Link>.</p></section>;
  const [all, shapes, jockeys, trainers, races] = await Promise.all([
    hubTrackDistances(), hubDistanceShapes(distance), hubPeople("jockey", { distances: [distance] }), hubPeople("trainer", { distances: [distance] }), upcomingRaces({ distance }),
  ]);
  const tracks = all.filter((r) => r.distance === distance);
  const front = shapes.filter((s) => s.frontRunnerWinPct !== null && (s.races ?? 0) >= 30);
  const leaders = front.length ? front.reduce((a, s) => a + s.frontRunnerWinPct! * (s.races ?? 0), 0) / front.reduce((a, s) => a + (s.races ?? 0), 0) : null;
  return (
    <section className="py-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{distance}m</h2>
          <Link href={`/data/distances?find=${distance}`} className="badge badge-muted">in the distance list</Link>
        </div>
        <p className="mt-1 text-sm text-ink-secondary">
          {d.runs.toLocaleString("en-AU")} timed runs at {d.tracks} tracks. Typical time {clock(d.typical)}, quickest track {d.quickest} at {clock(d.quickestMedian)}, record {clock(d.record)} at {d.recordTrack}.{leaders !== null ? ` The front runner wins ${leaders.toFixed(0)}% of races over it.` : ""}
        </p>
      </div>

      <div>
        <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">On over {distance}m next</h3>
        {races.length === 0 ? <p className="text-sm text-ink-soft">No {distance}m race on today&apos;s or tomorrow&apos;s card.</p> : <UpcomingRacesTable rows={races} />}
      </div>

      <div>
        <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Track by track</h3>
        <p className="mb-2 text-sm text-ink-secondary">Quickest standard time first. Click a track for its page.</p>
        <DistanceTracksTable rows={tracks} distance={distance} />
      </div>

      {shapes.length > 0 && (
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Where the leaders win over {distance}m</h3>
          <p className="mb-2 text-sm text-ink-secondary">How often the leader won, and held a place, by track over this trip, one row a race. The tracks at the top are where to be on the speed over {distance}m.</p>
          <DistanceShapeTable rows={shapes} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Jockeys over the trip</h3>
          <p className="mb-2 text-sm text-ink-secondary">Ranked on Power over {distance}m exactly. <Link href={`/data/jockeys${filterQuery({ distances: [distance] })}`} className="text-blue">Full list with filters</Link>.</p>
          <PeopleTable rows={jockeys.slice(0, 200)} what="rider" filtered compact />
        </div>
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Trainers over the trip</h3>
          <p className="mb-2 text-sm text-ink-secondary">Ranked on Power over {distance}m exactly. <Link href={`/data/trainers${filterQuery({ distances: [distance] })}`} className="text-blue">Full list with filters</Link>.</p>
          <PeopleTable rows={trainers.slice(0, 200)} what="stable" filtered compact />
        </div>
      </div>
    </section>
  );
}
