"use client";

import { Fragment, useEffect, useState } from "react";

import { BookieLink } from "./BookieLink";
import { SignalBadge } from "./Ratings";
import { RunnerDetail } from "./RunnerDetail";
import { Section } from "./Section";
import { percent, price, signedPercent } from "@/lib/format";
import type { PublishedRace } from "@/lib/model/types";

/**
 * The full field: our rated price against the market for every runner, with a
 * back or lay alert where the gap is big enough to act on. Click a runner for
 * the horse, its last runs, what to expect and our call.
 */
export function RunnerTable({ race, locked }: { race: PublishedRace; locked?: boolean }) {
  const runners = race.runners.filter((r) => !r.scratched);
  const scratched = race.runners.filter((r) => r.scratched);
  const [open, setOpen] = useState<number | null>(null);
  const cols = locked ? 8 : 11;

  // A shared link like #runner-7 opens that runner on arrival.
  useEffect(() => {
    const m = window.location.hash.match(/^#runner-(\d+)$/);
    if (!m || locked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(Number(m[1]));
    document.getElementById(`runner-${m[1]}`)?.scrollIntoView({ block: "center" });
  }, [locked]);

  function toggle(tab: number) {
    const next = open === tab ? null : tab;
    setOpen(next);
    history.replaceState(null, "", next ? `#runner-${next}` : window.location.pathname + window.location.search);
  }

  return (
    <Section id="market" letter="M" title="Market" aside={<span className="nums">{runners.length} runners</span>}>
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="data-table sm:min-w-[760px] text-sm">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Runner</th>
              <th className="hide-sm text-right">Bar</th>
              {!locked && <th>Signal</th>}
              <th className="hide-sm text-right">Wgt</th>
              <th className="hide-sm">Jockey</th>
              <th className="hide-sm">Form</th>
              <th className="text-right">Live</th>
              {!locked && <th className="text-right">Rated</th>}
              {!locked && <th className="hide-sm text-right">Win</th>}
              {!locked && <th className="text-right">Edge</th>}
            </tr>
          </thead>
          <tbody>
            {runners.map((r) => {
              const isOpen = open === r.tabNumber;
              return (
                <Fragment key={r.tabNumber}>
                  <tr
                    className={`runner-row ${isOpen ? "is-open" : ""}`}
                    id={`runner-${r.tabNumber}`}
                    onClick={() => !locked && toggle(r.tabNumber)}
                    aria-expanded={locked ? undefined : isOpen}
                  >
                    <td className="nums text-ink-soft">{r.tabNumber}</td>
                    <td>
                      <div className="min-w-0 flex items-center gap-2">
                        <div>
                          <div className="font-medium truncate">{r.horseName}</div>
                          <div className="text-[11px] text-muted truncate">{r.trainer ?? ""}</div>
                        </div>
                        {!locked && <span className={`runner-caret ${isOpen ? "is-open" : ""}`} aria-hidden="true" />}
                      </div>
                    </td>
                    <td className="hide-sm text-right nums text-ink-secondary">{r.barrier}</td>
                    {!locked && <td><SignalBadge signal={r.signal} prime={r.prime} /></td>}
                    <td className="hide-sm text-right nums text-ink-secondary">{r.weight ?? "—"}</td>
                    <td className="hide-sm text-ink-secondary truncate">{r.jockey ?? "—"}</td>
                    <td className="hide-sm nums text-ink-secondary">{r.form ?? "—"}</td>
                    <td className="text-right">
                      <span className={`price-chip ${locked ? "" : r.prime ? "is-prime" : r.signal === "back" ? "is-back" : r.signal === "lay" ? "is-lay" : ""}`}>
                        {price(r.marketPrice)}
                      </span>
                      {!locked && r.marketPrice ? <BookieLink codes={r.bookies} raceId={race.raceId} className="block text-[10px] mt-0.5" /> : null}
                    </td>
                    {!locked && <td className="text-right nums font-semibold">{price(r.ratedPrice)}</td>}
                    {!locked && <td className="hide-sm text-right nums text-ink-secondary">{percent(r.ratedProbability)}</td>}
                    {!locked && (
                      <td className="text-right nums">
                        <span className={r.prime ? "text-accent font-semibold" : r.signal === "back" ? "text-blue font-semibold" : r.signal === "lay" ? "text-red font-semibold" : "text-muted"}>
                          {signedPercent(r.edge)}
                        </span>
                      </td>
                    )}
                  </tr>
                  {isOpen && !locked && (
                    <tr className="runner-detail-row">
                      <td colSpan={cols}>
                        <RunnerDetail r={r} race={race} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line bg-panel-alt px-4 py-2 text-xs text-ink-soft space-y-1">
        {scratched.length > 0 && (
          <p className="text-muted">
            Scratched: {scratched.map((s) => `${s.tabNumber} ${s.horseName}`).join(", ")}
          </p>
        )}
        {locked ? (
          <p>Rated prices, edges and our bet or lay calls open with a pass.</p>
        ) : (
          <p>Click a runner for the horse, its last runs, what to expect and our call. Edge is our win chance minus the market&apos;s, in points.</p>
        )}
      </div>
    </Section>
  );
}
