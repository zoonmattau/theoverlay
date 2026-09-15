import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { FormWorm } from "@/components/FormWorm";
import { PaceGrid } from "@/components/PaceGrid";
import { RatingsTable } from "@/components/RatingsTable";
import { MAP_LABEL } from "@/components/Ratings";
import { getViewer, hasAccess } from "@/lib/auth";
import { percent, price } from "@/lib/format";
import { priceFantasy, rankHorses, searchHorses, type HorseSummary } from "@/lib/model/horses";
import { getTodayCard } from "@/lib/model/source";
import type { GoingBand } from "@/lib/model/types";

export const metadata: Metadata = {
  title: "Horses",
  description: "Every horse we have rated, ranked. Compare any of them, or put them in a race that has not been run and see how we would price it.",
  alternates: { canonical: "/horses" },
};

type Params = PageProps<"/horses">["searchParams"];

export default function Page({ searchParams }: { searchParams: Params }) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Horses searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const DISTANCES = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1800, 2000, 2400, 3200];
const CLASSES: [string, number][] = [["Maiden", 52], ["Class 1", 58], ["Bm64", 64], ["Bm70", 70], ["Bm78", 78], ["Bm88", 88], ["Open", 90], ["Listed", 96], ["Group 3", 104], ["Group 2", 112], ["Group 1", 122]];
const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Horses({ searchParams }: { searchParams: Params }) {
  await connection();
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const { date } = await getTodayCard(viewer.admin);
  const open = hasAccess(viewer, date);

  const ids = str(sp.h).split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const q = str(sp.q);
  const distance = DISTANCES.includes(Number(sp.d)) ? Number(sp.d) : 1200;
  const going: GoingBand = sp.g === "soft" || sp.g === "heavy" ? sp.g : "good";
  const classPoints = CLASSES.some(([, p]) => p === Number(sp.c)) ? Number(sp.c) : 70;
  const state = STATES.includes(str(sp.s)) ? str(sp.s) : undefined;
  const page = Math.max(1, Number(sp.p) || 1);

  // The chosen horses, priced as a race on the chosen conditions. The same
  // numbers serve the comparison and the fantasy market.
  const race = open && ids.length >= 2 ? await priceFantasy(ids, { distance, going, classPoints }) : undefined;
  const hits = q ? await searchHorses(q) : [];
  const ranked = ids.length === 0 || !open ? await rankHorses({ state, limit: 50, offset: (page - 1) * 50 }) : undefined;

  // Links that keep the rest of the query.
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all = { h: ids.join(","), q, d: String(distance), g: going, c: String(classPoints), s: state ?? "", ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    return `/horses${p.size ? `?${p}` : ""}`;
  };
  const withHorse = (id: string) => href({ h: [...ids.filter((x) => x !== id), id].join(","), q: "" });
  const withoutHorse = (id: string) => href({ h: ids.filter((x) => x !== id).join(",") });

  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">Horses</h1>
        <p className="mt-2 text-ink-secondary max-w-2xl">
          Every horse we have rated, best first. Pick two or more and see them side by side, then put them over any trip on any ground and we price the race as if it were on today&apos;s card.
        </p>
        <form action="/horses" method="get" className="mt-4 flex flex-wrap gap-2 items-end text-sm">
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
              <form action="/horses" method="get" className="card mt-4 flex flex-wrap items-end gap-3 text-sm">
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

      {ranked && (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight">Power rankings</h2>
              <p className="text-xs text-ink-soft">{ranked.total.toLocaleString("en-AU")} horses with a class rating, from every card we have run. Class is in benchmark points.</p>
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              <Link href={href({ s: "", p: "" })} className={`btn btn-sm ${state ? "btn-secondary" : "btn-primary"}`}>All</Link>
              {STATES.map((s) => <Link key={s} href={href({ s, p: "" })} className={`btn btn-sm ${state === s ? "btn-primary" : "btn-secondary"}`}>{s}</Link>)}
            </div>
          </div>
          <div className="section">
            <div className="overflow-x-auto">
              <table className="data-table text-sm">
                <thead><tr><th>#</th><th>Horse</th><th className="text-right">Class</th><th className="text-right">Age</th><th>Last seen</th><th></th></tr></thead>
                <tbody>
                  {ranked.rows.map((h, i) => <RankRow key={h.id} h={h} n={(page - 1) * 50 + i + 1} href={open ? withHorse(h.id) : undefined} chosen={ids.includes(h.id)} />)}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-xs text-ink-soft">
              <span>Page {page} of {Math.max(1, Math.ceil(ranked.total / 50))}</span>
              <span className="flex gap-2">
                {page > 1 && <Link href={href({ p: String(page - 1) })} className="hover:text-ink">← Newer</Link>}
                {page * 50 < ranked.total && <Link href={href({ p: String(page + 1) })} className="hover:text-ink">Next 50 →</Link>}
              </span>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function RankRow({ h, n, href, chosen }: { h: HorseSummary; n: number; href?: string; chosen: boolean }) {
  return (
    <tr>
      <td className="nums text-ink-soft">{n}</td>
      <td className="font-semibold">{h.name}</td>
      <td className="text-right nums">{h.class?.toFixed(1)}</td>
      <td className="text-right nums">{h.age ?? "—"}</td>
      <td className="text-ink-secondary text-xs">{h.lastTrack ?? "—"}, {new Date(`${h.lastSeen}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
      <td className="text-right">{href ? (chosen ? <span className="badge badge-prime">In</span> : <Link href={href} className="btn btn-secondary btn-sm">Add</Link>) : null}</td>
    </tr>
  );
}
