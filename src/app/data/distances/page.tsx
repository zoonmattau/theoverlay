import { Suspense } from "react";

import { DistancesTable } from "@/components/HubTables";
import { hubDistances } from "@/lib/data/hub";
import { HubLocked, hubViewer, param } from "../shared";

export default function Page({ searchParams }: PageProps<"/data/distances">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <Distances searchParams={searchParams} />
    </Suspense>
  );
}

async function Distances({ searchParams }: { searchParams: PageProps<"/data/distances">["searchParams"] }) {
  const [{ open }, find] = await Promise.all([hubViewer(), param(searchParams, "find")]);
  if (!open) return <HubLocked what="The distance and record tables" />;
  const distances = await hubDistances();
  return (
    <section className="py-6">
      <p className="mb-3 text-sm text-ink-secondary">The typical time over each distance, the track that runs it quickest, and the record we hold. Click a distance for its page: every track that runs it, where the leaders win over it, who rides and trains well over the trip, and what is on over it next.</p>
      <DistancesTable rows={distances} find={find || undefined} />
    </section>
  );
}
