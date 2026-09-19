"use client";

import { Fragment, useEffect, useState } from "react";

import { BookieLink } from "./BookieLink";
import { MarketHover } from "./MarketHover";
import { SignalBadge } from "./Ratings";
import { RunnerDetail } from "./RunnerDetail";
import type { PersonPower } from "@/lib/data/race-facts";
import { Section } from "./Section";
import { jumpTime, percent, price, signedPercent } from "@/lib/format";
import type { PublishedRace, Signal } from "@/lib/model/types";

/**
 * Admin only: the horses already ruled out of the lays, by key, and the
 * actions to rule one out or let it back in.
 */
export interface LayAdmin {
  blocked: string[];
  block: (name: string, path?: string, reason?: string) => Promise<void>;
  unblock: (key: string, path?: string) => Promise<void>;
}

/**
 * For a signed-in tipster: what they have posted on this race, and the
 * actions to post and take back a call from the table itself.
 */
export interface Tipping {
  date: string;
  /** Posted calls on this race by tab. */
  posted: Record<number, { id: number; side: Signal; price: number }>;
  /** Past the jump or resulted: no more posting. */
  closed: boolean;
  postTip: (form: FormData) => Promise<void>;
  removeTip: (id: number, path?: string) => Promise<void>;
}

/**
 * The full field: our rated price against the market for every runner, with a
 * back or lay alert where the gap is big enough to act on. Click a runner for
 * the horse, its last runs, what to expect and our call. A tipster gets a Tip
 * column on the right to post their own call on a runner.
 */
export function RunnerTable({ race, locked, people, tipping, lays }: { race: PublishedRace; locked?: boolean; /** Jockeys' and trainers' standing in the Datahub, by person key. */ people?: Promise<Record<string, PersonPower>>; tipping?: Tipping; lays?: LayAdmin }) {
  const runners = race.runners.filter((r) => !r.scratched);
  const scratched = race.runners.filter((r) => r.scratched);
  const [open, setOpen] = useState<number | null>(null);
  const [tipping_, setTipping] = useState<number | null>(null);
  const cols = (locked ? 8 : 12) + (tipping ? 1 : 0);
  const path = typeof window === "undefined" ? undefined : window.location.pathname;

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
    <Section
      id="market"
      letter="M"
      title="Market"
      aside={
        <span className="nums">
          {race.jumpTime ? <span className="market-jump">{jumpTime(race.jumpTime)}</span> : null}
          {runners.length} runners
        </span>
      }
    >
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="data-table sm:min-w-[820px] text-sm">
          <thead>
            <tr>
              <th data-col="tab" className="w-8">#</th>
              <th data-col="runner">Runner</th>
              <th data-col="bar" className="hide-sm text-right">Bar</th>
              {!locked && <th data-col="signal">Signal</th>}
              <th data-col="wgt" className="hide-sm text-right">Wgt</th>
              <th data-col="jockey" className="hide-sm">Jockey</th>
              <th data-col="form" className="hide-sm">Form</th>
              <th data-col="live" className="text-right">Live</th>
              {!locked && <th data-col="rated" className="text-right">Rated</th>}
              {!locked && <th data-col="win" className="hide-sm text-right">Win</th>}
              {!locked && <th data-col="edge" className="text-right tip tip-right cursor-help" data-tip="Our chance less the chance the best bookmaker price implies, in points. A bet needs +2.5 or more.">Back edge</th>}
              {!locked && <th data-col="lay" className="hide-sm text-right tip tip-right cursor-help" data-tip="Betfair's best lay on offer now, and our chance less the chance it implies. A lay needs −6 or more, at $12 or under.">Lay at</th>}
              {tipping && <th data-col="tip" className="text-right">Tip</th>}
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
                    <td data-col="tab" className="nums text-ink-soft">{r.tabNumber}</td>
                    <td data-col="runner">
                      <div className="min-w-0 flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.horseName}</div>
                          <div className="text-[11px] text-muted truncate">{r.trainer ?? ""}</div>
                          {/* On a phone the columns the table drops come back here, as one line under the name. */}
                          <div className="runner-meta nums">
                            <span>b{r.barrier}</span>
                            {r.weight ? <span>{r.weight}kg</span> : null}
                            {r.form ? <span>{r.form}</span> : null}
                          </div>
                        </div>
                        {!locked && <span className={`runner-caret ${isOpen ? "is-open" : ""}`} aria-hidden="true" />}
                      </div>
                    </td>
                    <td data-col="bar" className="hide-sm text-right nums text-ink-secondary">{r.barrier}</td>
                    {!locked && <td data-col="signal"><SignalBadge signal={r.signal} prime={r.prime} /></td>}
                    <td data-col="wgt" className="hide-sm text-right nums text-ink-secondary">{r.weight ?? "—"}</td>
                    <td data-col="jockey" className="hide-sm text-ink-secondary truncate">{r.jockey ?? "—"}</td>
                    <td data-col="form" className="hide-sm nums text-ink-secondary">{r.form ?? "—"}</td>
                    <td data-col="live" className="text-right">
                      <MarketHover r={r} className="market-right">
                        <span className={`price-chip ${locked ? "" : r.prime ? "is-prime" : r.signal === "back" ? "is-back" : r.signal === "lay" ? "is-lay" : ""}`}>
                          {price(r.marketPrice)}
                        </span>
                      </MarketHover>
                      {!locked && r.marketPrice ? <BookieLink codes={r.bookies} raceId={race.raceId} className="block text-[10px] mt-0.5" /> : null}
                    </td>
                    {!locked && <td data-col="rated" className="text-right nums font-semibold">{price(r.ratedPrice)}</td>}
                    {!locked && <td data-col="win" className="hide-sm text-right nums text-ink-secondary">{percent(r.ratedProbability)}</td>}
                    {!locked && (
                      <td data-col="edge" className="text-right nums">
                        <span className={r.prime ? "text-accent font-semibold" : r.signal === "back" ? "text-blue font-semibold" : r.signal === "lay" ? "text-red font-semibold" : "text-muted"}>
                          {signedPercent(r.edge)}
                        </span>
                      </td>
                    )}
                    {!locked && (
                      <td data-col="lay" className="hide-sm text-right nums whitespace-nowrap">
                        {r.layPrice ? (
                          <>
                            <span className="text-ink-secondary">{price(r.layPrice)}</span>{" "}
                            <span className={r.signal === "lay" ? "text-red font-semibold" : (r.layEdge ?? 0) <= -0.06 ? "text-red" : "text-muted"}>{signedPercent(r.layEdge)}</span>
                          </>
                        ) : "—"}
                      </td>
                    )}
                    {tipping && (
                      <td data-col="tip" className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {tipping.posted[r.tabNumber] ? (
                          <span className="inline-flex items-center gap-1">
                            <span className={`badge ${tipping.posted[r.tabNumber].side === "lay" ? "badge-lay" : "badge-back"}`}>{tipping.posted[r.tabNumber].side === "lay" ? "Lay" : "Bet"} {price(tipping.posted[r.tabNumber].price)}</span>
                            {!tipping.closed && (
                              <form action={tipping.removeTip.bind(null, tipping.posted[r.tabNumber].id, path)}>
                                <button type="submit" className="text-xs text-ink-soft hover:text-red" title="Take this call back">✕</button>
                              </form>
                            )}
                          </span>
                        ) : tipping.closed ? (
                          <span className="text-xs text-muted">closed</span>
                        ) : (
                          <button type="button" className={`btn btn-sm ${tipping_ === r.tabNumber ? "btn-primary" : "btn-secondary"}`} onClick={() => setTipping(tipping_ === r.tabNumber ? null : r.tabNumber)}>
                            Tip
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {tipping && tipping_ === r.tabNumber && !tipping.closed && (
                    <tr className="runner-detail-row">
                      <td colSpan={cols} onClick={(e) => e.stopPropagation()}>
                        <TipForm tipping={tipping} race={race} tab={r.tabNumber} name={r.horseName} market={r.marketPrice} onDone={() => setTipping(null)} />
                      </td>
                    </tr>
                  )}
                  {isOpen && !locked && (
                    <tr className="runner-detail-row">
                      <td colSpan={cols}>
                        <RunnerDetail r={r} race={race} people={people} lays={lays} />
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
        {tipping && !tipping.closed && <p>Tip posts a call of your own on that runner: it goes to your followers, your page and Discord, and settles at the price you post.</p>}
        {scratched.length > 0 && (
          <p className="text-muted">
            Scratched: {scratched.map((s) => `${s.tabNumber} ${s.horseName}`).join(", ")}
          </p>
        )}
        {locked ? (
          <p>Rated prices, edges and our bet or lay calls open with a pass.</p>
        ) : (
          <p>Click a runner for the horse, its last runs, what to expect and our call.</p>
        )}
      </div>
    </Section>
  );
}

/** The post form under a runner: side, your price, the price you took and where, and why. Your price starts at the market's best. */
function TipForm({ tipping, race, tab, name, market, onDone }: { tipping: Tipping; race: PublishedRace; tab: number; name: string; market?: number; onDone: () => void }) {
  return (
    <form
      action={async (fd) => {
        await tipping.postTip(fd);
        onDone();
      }}
      className="grid gap-3 sm:grid-cols-[auto_auto_auto_auto_1fr_auto] items-end text-sm p-3"
    >
      <input type="hidden" name="date" value={tipping.date} />
      <input type="hidden" name="raceId" value={race.raceId} />
      <input type="hidden" name="tab" value={tab} />
      <div className="sm:col-span-6 font-display font-extrabold">Your call on {tab}. {name}</div>
      <label className="field"><span>Call</span>
        <select name="side" className="field-input" defaultValue="back"><option value="back">Bet</option><option value="lay">Lay</option></select>
      </label>
      <label className="field"><span>Your rated price</span><input name="price" type="number" step="0.01" min="1.01" required defaultValue={market ? market.toFixed(2) : undefined} className="field-input w-28" /></label>
      <label className="field"><span>Price you took</span><input name="bookiePrice" type="number" step="0.01" min="1.01" placeholder={market ? market.toFixed(2) : "4.20"} className="field-input w-28" /></label>
      <label className="field"><span>Bookie</span><input name="bookie" maxLength={40} className="field-input w-36" placeholder="Sportsbet" /></label>
      <label className="field"><span>Why, one or two sentences</span><input name="comment" maxLength={280} className="field-input w-full" placeholder="Maps to lead on a track that favours leaders." /></label>
      <button className="btn btn-primary btn-sm" type="submit">Post</button>
    </form>
  );
}
