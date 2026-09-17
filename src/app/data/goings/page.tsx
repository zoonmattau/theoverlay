import { Suspense } from "react";

import { GoingsTable } from "@/components/HubTables";
import { hubGoings } from "@/lib/data/hub";
import { HubLocked, hubViewer, param } from "../shared";

export default function Page({ searchParams }: PageProps<"/data/goings">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <Goings searchParams={searchParams} />
    </Suspense>
  );
}

async function Goings({ searchParams }: { searchParams: PageProps<"/data/goings">["searchParams"] }) {
  const [{ open }, find] = await Promise.all([hubViewer(), param(searchParams, "find")]);
  if (!open) return <HubLocked what="The going tables" />;
  const rows = await hubGoings();
  return (
    <section className="py-6">
      <p className="mb-3 text-sm text-ink-secondary">What soft and heavy ground cost against good, track by track and distance by distance, in seconds of typical time and in lengths.</p>
      <GoingsTable rows={rows} find={find || undefined} />
    </section>
  );
}
