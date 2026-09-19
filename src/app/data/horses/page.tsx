import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { FormWorm } from "@/components/FormWorm";
import { HorsesTable } from "@/components/HorsesTable";
import { PaceGrid } from "@/components/PaceGrid";
import { RatingsTable } from "@/components/RatingsTable";
import { MAP_LABEL } from "@/components/Ratings";
import { HubLocked } from "@/app/data/shared";
import { getViewer, hasAccess } from "@/lib/auth";
import { percent, price } from "@/lib/format";
import { priceFantasy, rankHorses, searchHorses } from "@/lib/model/horses";
import { getTodayCard } from "@/lib/model/source";
import type { GoingBand } from "@/lib/model/types";

export const metadata: Metadata = {
  title: "Horses",
  robots: { index: false },
  description: "Every horse we have rated, ranked. Compare any of them, or put them in a race that has not been run and see how we would price it.",
  alternates: { canonical: "/data/horses" },
};

type Params = PageProps<"/data/horses">["searchParams"];

export default function Page({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <Horses searchParams={searchParams} />
    </Suspense>
  );
}

const DISTANCES = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1800, 2000, 2400, 3200];
const CLASSES: [string, number][] = [["Maiden", 52], ["Class 1", 58], ["Bm64", 64], ["Bm70", 70], ["Bm78", 78], ["Bm88", 88], ["Open", 90], ["Listed", 96], ["Group 3", 104], ["Group 2", 112], ["Group 1", 122]];

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Horses({ searchParams }: { searchParams: Params }) {
  await connection();
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const { date } = await getTodayCard(viewer.admin);
  const open = hasAccess(viewer, date);
  if (!open) return <HubLocked what="The horse power rankings" />;

  const ids = str(sp.h).split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const q = str(sp.q);
  const distance = DISTANCES.includes(Number(sp.d)) ? Number(sp.d) : 1200;
  const going: GoingBand = sp.g === "soft" || sp.g === "heavy" ? sp.g : "good";
  const classPoints = CLASSES.some(([, p]) => p === Number(sp.c)) ? Number(sp.c) : 70;

  // The chosen horses, priced as a race on the chosen conditions. The same
  // numbers serve the comparison and the fantasy market.
  const race = open && ids.length >= 2 ? await priceFantasy(ids, { distance, going, classPoints }) : undefined;
  const hits = q ? await searchHorses(q) : [];
  // The all-time list is led by horses long retired, so the page offers a cut
  // on when a horse last ran; it changes which thousand load, so it is served.
  const seen = ["30", "60", "180"].includes(str(sp.seen)) ? str(sp.seen) : "";
  const ranked = await rankHorses(1000, seen ? { sinceDays: Number(seen) } : {});

  // Links that keep the rest of the query.
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all = { h: ids.join(","), q, d: String(distance), g: going, c: String(classPoints), seen, ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    return `/data/horses${p.size ? `?${p}` : ""}`;
  };
  const withHorse = (id: string) => href({ h: [...ids.filter((x) => x !== id), id].join(","), q: "" });
  const withoutHorse = (id: string) => href({ h: ids.filter((x) => x !== id).join(",") });

  return (
    <>
      <section className="py-6">
        <h2 className="font-display text-xl font-extrabold tracking-tight">Horse power rankings</h2>
        <p className="mt-2 text-sm text-ink-secondary max-w-2xl">
          Every horse we have rated, best first. Pick two or more and see them side by side, then put them over any trip on any ground and we price the race as if it were on today&apos;s card.
        </p>
        <form action="/data/horses" method="get" className="mt-4 flex flex-wrap gap-2 items-end text-sm">
          <input type="hidden" name="h" value={ids.join(",")} />
          <input type="hidden" name="d" value={distance} />
          <input type="hidden" name="g" value={going} />
          <input type="hidden" name="c" value={classPoints} />
          <label className="field flex-1 min-w-[220px]"><span>Find a horse</span><input name="q" defaultValue={q} className="field-input w-full" placeholder="Start typing a name" autoComplete="off" /></label>
          <button className="btn btn-secondary btn-sm" type="submit">Search</button>
        </form>
        {hits.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {hits.map((h) => (
              <li key={h.id}>
                <Link href={open ? withHorse(h.id) : "/pricing"} className="badge badge-muted hover:bg-lime hover:text-ink">
                  {h.name}{h.class !== null ? ` · ${h.class.toFixed(1)}` : ""}{h.lastTrack ? ` · ${h.lastTrack}` : ""}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {q && hits.length === 0 && <p className="mt-2 text-xs text-ink-soft">Nothing by that name. We only hold horses that have run on a card we rated.</p>}
      </section>

      {!open && (
        <div className="card border-lime bg-lime-soft mb-6 flex flex-wrap items-center gap-3">
          <span className="badge badge-prime">Members</span>
          <span className="text-sm">Comparing horses and pricing a race is for members. The rankings are free to browse.</span>
          <Link href="/pricing" className="btn btn-primary ml-auto">See plans</Link>
        </div>
      )}

      {open && ids.length > 0 && (
        <section className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">In the race</span>
            {race
              ? race.runners.map((r) => (
                  <Link key={r.tabNumber} href={withoutHorse(ids[r.tabNumber - 1])} className="badge badge-muted hover:bg-red-soft hover:text-red" title="Remove">
                    {r.horseName} ×
                  </Link>
                ))
              : ids.map((id) => (
                  <Link key={id} href={withoutHorse(id)} className="badge badge-muted hover:bg-red-soft hover:text-red" title="Remove">{id.split("_").slice(2).join(" ")} ×</Link>
                ))}
            {ids.length < 2 && <span className="text-xs text-ink-soft">Add at least one more to price a race.</span>}
            {ids.length > 0 && <Link href={href({ h: "" })} className="text-xs text-ink-soft hover:text-ink ml-2">Clear</Link>}
          </div>

          {race && (
            <>
              <form action="/data/horses" method="get" className="card mt-4 flex flex-wrap items-end gap-3 text-sm">
                <input type="hidden" name="h" value={ids.join(",")} />
                <label className="field"><span>Distance</span>
                  <select name="d" defaultValue={distance} className="field-input">
                    {DISTANCES.map((d) => <option key={d} value={d}>{d}m</option>)}
                  </select>
                </label>
                <label className="field"><span>Going</span>
                  <select name="g" defaultValue={going} className="field-input">
                    <option value="good">Good</option><option value="soft">Soft</option><option value="heavy">Heavy</option>
                  </select>
                </label>
                <label className="field"><span>Class</span>
                  <select name="c" defaultValue={classPoints} className="field-input">
                    {CLASSES.map(([label, p]) => <option key={p} value={p}>{label}</option>)}
                  </select>
                </label>
                <button className="btn btn-primary btn-sm" type="submit">Price it</button>
                <span className="text-xs text-ink-soft">Form only, there is no market to lean on. Barriers are in the order you added them, weights are what each carried last start.</span>
              </form>

              <div className="section mt-4">
                <div className="section-bar">
                  <span className="section-letter">F</span>
                  <h2>The market we make</h2>
                  <span className="ml-auto text-xs text-ink-soft nums">{distance}m, {going}, par {classPoints}, {race.pace.tempo} tempo</span>
                </div>
                <div className="section-body">
                  <p className="text-sm text-ink-secondary mb-3">{race.verdict}</p>
                  <div className="overflow-x-auto">
                    <table className="data-table text-sm">
                      <thead><tr><th>#</th><th>Horse</th><th className="text-right">Our price</th><th className="text-right">Chance</th><th className="text-right">Today</th><th>Settles</th><th>Why</th></tr></thead>
                      <tbody>
                        {[...race.runners].sort((a, b) => a.ratedPrice - b.ratedPrice).map((r, i) => (
                          <tr key={r.tabNumber} className={i === 0 ? "font-semibold" : ""}>
                            <td className="nums text-ink-soft">{i + 1}</td>
                            <td>{r.horseName}</td>
                            <td className="text-right nums">{price(r.ratedPrice)}</td>
                            <td className="text-right nums">{percent(r.ratedProbability)}</td>
                            <td className="text-right nums">{r.ratings.today.toFixed(1)}</td>
                            <td className="text-xs text-ink-secondary">{MAP_LABEL[r.ratings.map]}</td>
                            <td className="text-xs text-ink-secondary">{r.why ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <RatingsTable race={race} />
              </div>
              <div className="card mt-4">
                <h2 className="font-display font-extrabold mb-2">Run by run</h2>
                <FormWorm race={race} />
              </div>
              <div className="mt-4">
                <PaceGrid race={race} />
              </div>
            </>
          )}
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">Power rankings</h2>
            <p className="text-xs text-ink-soft">Every horse we have rated, from every card we have run. Ratings are in benchmark points. Click a heading to sort{open ? ", a row to add it to the race" : ""}.</p>
          </div>
        </div>
        <HorsesTable rows={ranked.rows} total={ranked.total} chosen={ids} query={{ d: String(distance), g: going, c: String(classPoints), h: ids.join(",") }} canPick={open} seen={seen} />
      </section>
    </>
  );
}
