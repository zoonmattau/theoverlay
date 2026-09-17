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

async function Combos({ searchParams }: { searchParams: PageProps<"/data/combos">["searchParams"] }) {
  const [{ open }, sp] = await Promise.all([hubViewer(), searchParams]);
  if (!open) return <HubLocked what="The jockey and trainer combinations" />;
  const filter = filterFrom(sp);
  const [rows, tracks] = await Promise.all([hubCombos(filter), hubTracksList()]);
  return (
    <section className="py-6">
      <p className="mb-3 text-sm text-ink-secondary">Jockey and trainer together, five runs or more as a pair, ranked on how the pairing goes against the market.</p>
      <HubFilters base="/data/combos" filter={filter} tracks={tracks} find={str(sp.find) || undefined} />
      {filterActive(filter) && <p className="mb-2 text-sm font-semibold">{filterWords(filter)}</p>}
      <CombosTable rows={rows} find={str(sp.find) || undefined} />
    </section>
  );
}
