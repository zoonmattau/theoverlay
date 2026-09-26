import { notFound } from "next/navigation";
import { Suspense } from "react";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { TrackMap, trackMapFor, type Track } from "@/components/TrackMap";
import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";

/** A look at a track's map at a spread of distances, before it goes in the race header. */
export default function Page({ searchParams }: PageProps<"/admin/trackmap">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Maps searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Maps({ searchParams }: { searchParams: PageProps<"/admin/trackmap">["searchParams"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const sp = await searchParams;
  if (sp.all) return <All distance={Number(sp.d) || 1200} />;
  const name = typeof sp.track === "string" ? sp.track : "Flemington";
  const track = trackMapFor(name);
  if (!track) return <p className="py-6">No map for {name} yet.</p>;
  const distances = name.toLowerCase() === "caulfield" ? [1000, 1100, 1200, 1400, 1600, 1700, 1800, 2000, 2400] : [1000, 1200, 1400, 1600, 2000, 2500, 3200];
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold tracking-tight py-6">{name} track maps</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {distances.map((d) => (
          <div key={d} className="card">
            <div className="font-display font-extrabold mb-2">{d}m</div>
            <TrackMap track={track} distance={d} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Every map built, the doubtful ones too, at one distance: the review before they go live. */
function All({ distance }: { distance: number }) {
  const dir = path.join(process.cwd(), "src/lib/tracks");
  const tracks = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf-8")) as Track);
  const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  tracks.sort((a, b) => (rank[a.auto?.confidence ?? "high"] ?? 0) - (rank[b.auto?.confidence ?? "high"] ?? 0) || a.name.localeCompare(b.name));
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold tracking-tight py-6">All track maps, {distance}m</h1>
      <p className="text-sm text-ink-soft -mt-4 mb-4">Low confidence maps stay off the site until fixed. <a className="underline" href={`?all=1&d=${distance === 1200 ? 2000 : 1200}`}>Show {distance === 1200 ? 2000 : 1200}m</a></p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tracks.map((t) => (
          <div key={t.name} className="card">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <a className="font-display font-extrabold underline" href={`?track=${t.name}`}>{t.name}</a>
              <span className={`badge ${t.auto?.confidence === "low" ? "badge-lay" : t.auto?.confidence === "medium" ? "badge-warn" : "badge-prime"}`}>{t.auto?.confidence ?? "checked"}</span>
            </div>
            <div className="text-[11px] text-ink-soft mb-2">
              {t.clockwise ? "Clockwise" : "Anticlockwise"} · {Math.round(t.loopLength)}m{t.auto ? ` · post by ${t.auto.post}` : ""}
              {t.chutes.length ? ` · chutes ${t.chutes.map((c) => c.startDistance).join(", ")}m` : " · no chutes"}
            </div>
            <TrackMap track={t} distance={distance} />
          </div>
        ))}
      </div>
    </>
  );
}
