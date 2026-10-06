import Link from "next/link";
import { Suspense } from "react";

import { HorseRunsTable } from "@/components/HorseRunsTable";
import { horseRuns } from "@/lib/data/horse";
import { bm, bmGap } from "@/lib/model/display";
import { horseSummary } from "@/lib/model/horses";
import { HubLocked, hubViewer } from "../../shared";

export default function Page({ params }: PageProps<"/data/horses/[id]">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <Horse params={params} />
    </Suspense>
  );
}

const pts = (v: number | null | undefined) => (v === null || v === undefined || v < 0 ? "—" : bm(v).toFixed(1));
const day = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

/** One horse: its ratings from the stored card, its career line, and every run we hold, all from Supabase. */
async function Horse({ params }: { params: PageProps<"/data/horses/[id]">["params"] }) {
  const [{ open }, { id }] = await Promise.all([hubViewer(), params]);
  if (!open) return <HubLocked what="Horse pages" />;
  const horse = await horseSummary(decodeURIComponent(id));
  if (!horse) {
    return <section className="py-6 text-sm text-ink-soft">We hold no horse by that id. <Link href="/data/horses" className="text-blue">Back to the rankings</Link>.</section>;
  }
  const runs = await horseRuns(horse.name);
  const c = horse.career;
  const g = horse.ratings;
  const trend = horse.trend === null ? "—" : `${horse.trend > 0 ? "+" : horse.trend < 0 ? "−" : ""}${Math.abs(bmGap(horse.trend)).toFixed(1)}`;
  return (
    <section className="py-6 space-y-6">
      <div>
        <Link href="/data/horses" className="text-xs text-ink-soft hover:text-ink">← Horse rankings</Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{horse.name}</h2>
          <Link href={`/data/horses?h=${encodeURIComponent(horse.id)}`} className="btn btn-secondary btn-sm">Put in a race</Link>
        </div>
        <p className="mt-1 text-sm text-ink-secondary">
          {[horse.age ? `${horse.age}yo` : null, horse.state, horse.lastTrack ? `last ran at ${horse.lastTrack}, ${day(horse.lastSeen)}` : null].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <Stat n={pts(horse.class)} label="Class" />
          <Stat n={pts(horse.peak)} label="Best run" />
          <Stat n={trend} label="Trend" tone={horse.trend !== null && horse.trend > 0.5 ? "prime" : horse.trend !== null && horse.trend < -0.5 ? "lay" : undefined} />
          <Stat n={c ? `${c.starts}: ${c.wins}-${c.seconds}-${c.thirds}` : "—"} label="Career" />
          <Stat n={c?.starts ? `${((c.wins / c.starts) * 100).toFixed(0)}%` : "—"} label="Win rate" />
          <Stat n={c?.starts ? `${(((c.wins + c.seconds + c.thirds) / c.starts) * 100).toFixed(0)}%` : "—"} label="Place rate" />
        </div>
        {g && (
          <div className="mt-3 grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
            {([["Early", g.early], ["Mid", g.mid], ["Late", g.late], ["Pressure", g.pressure], ["Good", g.going.good], ["Soft", g.going.soft], ["Heavy", g.going.heavy]] as const).map(([label, v]) => (
              <div key={label} className="rounded-md border border-line-soft bg-panel px-2 py-1.5">
                <div className="nums font-semibold">{pts(v)}</div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="font-display text-lg font-extrabold tracking-tight mb-1">Every run we hold</h3>
        {runs.length === 0 ? <p className="text-sm text-ink-soft">No past runs on the form we hold yet.</p> : <HorseRunsTable rows={runs} />}
      </div>
    </section>
  );
}

function Stat({ n, label, tone }: { n: string; label: string; tone?: "prime" | "lay" }) {
  return (
    <div className="card py-3 text-center">
      <div className={`font-display font-extrabold text-xl nums ${tone === "prime" ? "text-accent" : tone === "lay" ? "text-red" : ""}`}>{n}</div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">{label}</div>
    </div>
  );
}
