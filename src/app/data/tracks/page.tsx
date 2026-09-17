import { Suspense } from "react";

import { TracksTable } from "@/components/HubTables";
import { hubTracks } from "@/lib/data/hub";
import { HubLocked, hubViewer, param } from "../shared";

export default function Page({ searchParams }: PageProps<"/data/tracks">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <Tracks searchParams={searchParams} />
    </Suspense>
  );
}

async function Tracks({ searchParams }: { searchParams: PageProps<"/data/tracks">["searchParams"] }) {
  const [{ open }, find] = await Promise.all([hubViewer(), param(searchParams, "find")]);
  if (!open) return <HubLocked what="The track and standard time tables" />;
  const tracks = await hubTracks();
  return (
    <section className="py-6">
      <p className="mb-3 text-sm text-ink-secondary">Which tracks are quick and which are slow, from the times run on them, and how the feed&apos;s benchmark reads each. Click a track for its page: standard times by distance and going, how races are run there, who rides and trains well there, and what is on there next.</p>
      <TracksTable rows={tracks} find={find || undefined} />
    </section>
  );
}
