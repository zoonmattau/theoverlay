"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { RaceMix, RaceTip } from "@/lib/model/types";
import { mixClass, mixStyle } from "./mix";

export interface MiniRace {
  raceId: string;
  raceNumber: number;
  clock: string;
  resulted: boolean;
  tip?: RaceTip;
  /** Every kind of call in the race; more than one and the cell is striped like the board. */
  mix?: RaceMix;
  group?: 1 | 2 | 3;
  /** The tipster the viewer follows has a call in this race: their initial. */
  tipster?: string;
}

export interface MiniMeeting {
  meetingId: string;
  track: string;
  condition?: string;
  races: MiniRace[];
}

/**
 * The track name on a race card opens a mini matrix of every race on the
 * day, so you can jump anywhere without going back to Today.
 */
export function TrackMenu({
  track,
  date,
  currentRaceId,
  meetings,
}: {
  track: string;
  date: string;
  currentRaceId: string;
  meetings: MiniMeeting[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cols = Math.max(0, ...meetings.map((m) => m.races.length));

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        className="track-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {track}
        <span className={`track-menu-caret ${open ? "is-open" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="track-menu" role="menu">
          <div className="track-menu-head">
            <span>Today&apos;s races</span>
            <Link href="/" className="text-blue hover:underline" onClick={() => setOpen(false)}>
              Full board
            </Link>
          </div>
          <table className="mini-matrix">
            <tbody>
              {meetings.map((m) => (
                <tr key={m.meetingId}>
                  <th>
                    {m.track}
                    {m.condition && <span className="mini-cond">{m.condition}</span>}
                  </th>
                  {Array.from({ length: cols }, (_, i) => {
                    const r = m.races[i];
                    if (!r) return <td key={i} />;
                    const cls = [
                      "mini-cell",
                      r.raceId === currentRaceId ? "is-current" : "",
                      r.resulted ? "is-resulted" : "",
                      r.tip ? (r.resulted ? `had-${r.tip}` : `tip-${r.tip}`) : "",
                      mixClass(r.mix ?? []),
                    ].join(" ");
                    return (
                      <td key={r.raceId}>
                        <Link
                          href={`/racing/${date}/${m.meetingId}/${r.raceId}`}
                          className={cls}
                          style={mixStyle(r.mix ?? [], r.resulted)}
                          onClick={() => setOpen(false)}
                          role="menuitem"
                        >
                          {r.group && <span className={`medal medal-${r.group}`} title={`Group ${r.group}`}>G{r.group}</span>}
                          {r.tipster && <span className="matrix-tipster mini-tipster">{r.tipster}</span>}
                          <span className="mini-r">R{r.raceNumber}</span>
                          <span className="mini-t nums">{r.resulted ? "Run" : r.clock}</span>
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
