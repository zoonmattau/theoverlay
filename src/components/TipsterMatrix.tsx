"use client";

import { useState } from "react";

import { goingClass } from "./RaceMatrix";

/**
 * The tipster's day: the same track-by-race grid as the board. Tap a race to
 * open the post form under it. Cells fill blue or red with what the tipster
 * has on, grey once the race has run.
 */
export interface MatrixRunner {
  tab: number;
  name: string;
  price?: number;
}
export interface MatrixRace {
  raceId: string;
  raceNumber: number;
  name: string;
  distance: number;
  className?: string;
  clock: string;
  resulted: boolean;
  /** Past the advertised jump time, so no more calls unless `late` is allowed. */
  jumped: boolean;
  runners: MatrixRunner[];
  /** Posted calls on this race, tab to side. */
  posted: Record<number, "back" | "lay">;
}
export interface MatrixMeeting {
  meetingId: string;
  track: string;
  state: string;
  condition?: string;
  races: MatrixRace[];
}

export function TipsterMatrix({ meetings, date, action, late }: { meetings: MatrixMeeting[]; date: string; action: (form: FormData) => Promise<void>; late?: boolean }) {
  const [picked, setPicked] = useState<string | undefined>();
  const cols = Math.max(0, ...meetings.map((m) => m.races.length));
  const race = meetings.flatMap((m) => m.races.map((r) => ({ m, r }))).find(({ r }) => r.raceId === picked);
  const money = (p?: number) => (p ? ` ($${p % 1 ? p.toFixed(2) : p})` : "");

  return (
    <div>
      <div className="matrix-wrap">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-track">Track</th>
              {Array.from({ length: cols }, (_, i) => <th key={i}>R{i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.meetingId}>
                <td className="matrix-track">
                  <div>
                    {m.track}
                    <span className="matrix-track-state">
                      {m.state}
                      {m.condition && <span className={`going-chip ${goingClass(m.condition)}`}>{m.condition}</span>}
                    </span>
                  </div>
                </td>
                {Array.from({ length: cols }, (_, i) => {
                  const r = m.races[i];
                  if (!r) return <td key={i} className="matrix-cell matrix-empty">-</td>;
                  const sides = Object.values(r.posted);
                  const tip = sides.includes("back") ? "back" : sides.includes("lay") ? "lay" : undefined;
                  const active = r.raceId === picked;
                  const closed = r.resulted || (r.jumped && !late);
                  return (
                    <td key={r.raceId} className="matrix-cell">
                      <button
                        type="button"
                        disabled={closed}
                        onClick={() => setPicked(active ? undefined : r.raceId)}
                        className={`matrix-btn ${r.resulted ? "race-resulted" : r.jumped ? "race-jumped" : ""} ${!closed && tip ? `tip-${tip}` : ""} ${active ? "ring-2 ring-ink" : ""}`}
                        aria-pressed={active}
                      >
                        <span className="matrix-race">R{r.raceNumber}</span>
                        <span className="matrix-time nums">{r.resulted ? "run" : r.jumped ? "jumped" : r.clock}</span>
                        {sides.length > 0 && <span className="matrix-count">{sides.length} {sides.length === 1 ? "call" : "calls"}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="legend border-t border-line px-4 py-3">
          <span className="font-bold uppercase tracking-[0.08em] text-[0.65rem]">Legend</span>
          <span><span className="legend-dot bg-blue" />Your bet</span>
          <span><span className="legend-dot bg-red" />Your lay</span>
          <span><span className="legend-dot bg-surface-alt" />Run</span>
          <span>Tap a race to post on it. Posting closes at the jump.</span>
        </div>
      </div>

      {race && (
        <div className="card mt-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display font-extrabold">{race.m.track} R{race.r.raceNumber}</span>
            <span className="text-sm text-ink-secondary">{race.r.name}, {race.r.distance}m{race.r.className ? `, ${race.r.className}` : ""}</span>
            <span className="ml-auto text-xs text-ink-soft nums">{race.r.clock}</span>
          </div>
          <form
            key={race.r.raceId}
            action={async (fd) => {
              await action(fd);
              setPicked(undefined);
            }}
            className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] items-end text-sm"
          >
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="raceId" value={race.r.raceId} />
            <label className="field"><span>Runner</span>
              <select name="tab" required className="field-input" id={`tab-${race.r.raceId}`}>
                {race.r.runners.map((x) => (
                  <option key={x.tab} value={x.tab}>
                    {x.tab}. {x.name}{money(x.price)}{race.r.posted[x.tab] ? ` · posted ${race.r.posted[x.tab] === "lay" ? "lay" : "bet"}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field"><span>Call</span>
              <select name="side" className="field-input" id={`side-${race.r.raceId}`}><option value="back">Bet</option><option value="lay">Lay</option></select>
            </label>
            <label className="field"><span>Your price</span><input name="price" id={`price-${race.r.raceId}`} type="number" step="0.01" min="1.01" required placeholder="4.50" className="field-input w-28" /></label>
            <label className="field"><span>Bookie price</span><input name="bookiePrice" id={`bookieprice-${race.r.raceId}`} type="number" step="0.01" min="1.01" placeholder="4.20" className="field-input w-28" /></label>
            <label className="field"><span>Bookie</span><input name="bookie" id={`bookie-${race.r.raceId}`} maxLength={40} className="field-input w-36" placeholder="Sportsbet" /></label>
            <label className="field sm:col-span-4"><span>Why, one or two sentences</span><input name="comment" id={`why-${race.r.raceId}`} maxLength={280} className="field-input w-full" placeholder="Maps to lead on a track that favours leaders, and drops back in class." /></label>
            <button className="btn btn-primary btn-sm" type="submit">Post</button>
          </form>
          <p className="mt-2 text-xs text-ink-soft">Runner prices in the list are the best we can see now. A price more than 20% above that gets a flag next to the call, so keep it to one you can actually get.</p>
        </div>
      )}
    </div>
  );
}
