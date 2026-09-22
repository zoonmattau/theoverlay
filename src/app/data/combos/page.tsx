import { Suspense } from "react";

import { HubFilters } from "../HubFilters";
import { HubLocked, hubViewer } from "../shared";
import { CombosTable } from "@/components/HubTables";
import { filterActive, filterFrom, filterWords } from "@/lib/data/filters";
import { hubCombos, hubTracksList } from "@/lib/data/hub";

export default function Page({ searchParams }: PageProps<"/data/combos">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <Combos searchParams={searchParams} />
    </Suspense>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** Pairings sent to the page from the top of the ranking, before the well-raced rest. */
const TOP = 2000;

async function Combos({ searchParams }: { searchParams: PageProps<"/data/combos">["searchParams"] }) {
  const [{ open }, sp] = await Promise.all([hubViewer(), searchParams]);
  if (!open) return <HubLocked what="The jockey and trainer combinations" />;
  const filter = filterFrom(sp);
  const [all, tracks] = await Promise.all([hubCombos(filter), hubTracksList()]);
  // Seventeen thousand pairings is too many to send: the top of the
  // ranking and every pairing with a record worth reading go, the rest is
  // reached by filtering to a track or a state.
  const rows = all.length > TOP ? all.filter((r, i) => i < TOP || r.rides >= 20) : all;
  return (
    <section className="py-6">
      <p className="mb-3 text-sm text-ink-secondary">Jockey and trainer together, five runs or more as a pair, ranked on how the pairing goes against the market.</p>
      <HubFilters base="/data/combos" filter={filter} tracks={tracks} find={str(sp.find) || undefined} />
      {filterActive(filter) && <p className="mb-2 text-sm font-semibold">{filterWords(filter)}</p>}
      <CombosTable rows={rows} find={str(sp.find) || undefined} note={rows.length < all.length ? `${rows.length.toLocaleString("en-AU")} of ${all.length.toLocaleString("en-AU")} pairings loaded: the top ${TOP.toLocaleString("en-AU")} and every pair with 20 runs. Filter by state or track for the rest.` : undefined} />
    </section>
  );
}
