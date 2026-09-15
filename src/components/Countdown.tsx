"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * One matrix cell. Time to the jump ticks on the client; the server paints the
 * clock time so the first render matches.
 */
export function MatrixCell({
  href,
  raceNumber,
  iso,
  clock,
  result,
  backs,
  lays,
  prime,
  group,
  free,
  tipster,
}: {
  href: string;
  raceNumber: number;
  iso?: string;
  clock: string;
  result?: number[];
  backs: number;
  lays: number;
  prime?: boolean;
  /** 1, 2 or 3 for a Group race, shown as gold, silver or bronze. */
  group?: 1 | 2 | 3;
  /** Today's free race, for a viewer who cannot open the others. */
  free?: boolean;
  /** The name of the tipster the viewer follows, when they have a call in this race. */
  tipster?: string;
}) {
  const medal = group ? <span className={`medal medal-${group}`} title={`Group ${group}`}>G{group}</span> : null;
  const freeTag = free ? <span className="matrix-free">Free</span> : null;
  const tipsterTag = tipster ? <span className="matrix-tipster" title={`${tipster} has a call in this race`}>{tipster.trim()[0]?.toUpperCase()}</span> : null;
  const [state, setState] = useState<{ label: string; status: string }>({
    label: clock,
    status: "",
  });

  useEffect(() => {
    if (!iso || result) return;
    const jump = new Date(iso).getTime();
    const tick = () => {
      const ms = jump - Date.now();
      setState({ label: countdown(ms, clock), status: status(ms) });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [iso, clock, result]);

  const tip = prime ? "prime" : backs > 0 ? "back" : lays > 0 ? "lay" : undefined;

  // Resulted: the race number and the first four home, with a border in the
  // colour of what we had on.
  if (result) {
    return (
      <Link href={href} className={`matrix-btn race-resulted ${tip ? `had-${tip}` : ""}`}>
        {medal}
        {freeTag}
        {tipsterTag}
        <span className="matrix-race">R{raceNumber}</span>
        <span className="matrix-result nums">{result.join(",")}</span>
      </Link>
    );
  }

  const tag = prime ? "Prime" : backs > 0 ? plural(backs, "bet") : lays > 0 ? plural(lays, "lay") : undefined;

  return (
    <Link href={href} className={`matrix-btn ${tip ? `tip-${tip}` : ""} ${state.status}`}>
      {medal}
      {freeTag}
      {tipsterTag}
      <span className="matrix-race">R{raceNumber}</span>
      <span className="matrix-time nums">{state.label}</span>
      {tag && <span className={`matrix-count nums is-${tip}`}>{tag}</span>}
    </Link>
  );
}

function countdown(ms: number, clock: string): string {
  if (ms <= -10 * 60_000) return "Run";
  if (ms <= 0) return "Now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return clock;
}

function status(ms: number): string {
  if (ms <= -10 * 60_000) return "race-jumped";
  if (ms <= 15 * 60_000) return "race-imminent";
  return "";
}

/** A pill for the next-to-go strip; hides itself ten minutes after the jump. */
export function NtgCountdown({
  href,
  iso,
  clock,
  label,
  tip,
  tag,
}: {
  href: string;
  iso?: string;
  clock: string;
  label: string;
  tip?: "prime" | "back" | "lay";
  tag?: string;
}) {
  const [state, setState] = useState<{ label: string; status: string; gone: boolean }>({
    label: clock,
    status: "",
    gone: false,
  });

  useEffect(() => {
    if (!iso) return;
    const jump = new Date(iso).getTime();
    const tick = () => {
      const ms = jump - Date.now();
      setState({ label: countdown(ms, clock), status: status(ms), gone: ms <= -10 * 60_000 });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [iso, clock]);

  if (state.gone) return null;

  return (
    <Link href={href} className={`ntg-item ${state.status} ${tip ? `tip-${tip}` : ""}`}>
      <span className="ntg-head">
        <span className="ntg-track">{label}</span>
        <span className="ntg-time nums">{state.label}</span>
      </span>
      <span className="ntg-tag">{tag ?? "No tip"}</span>
    </Link>
  );
}

/** Time to the jump as text, ticking: "42m", "1h 12m", "Now", "Run", or the clock when it is a day away. */
export function Jumps({ iso, clock }: { iso?: string; clock: string }) {
  const [label, setLabel] = useState(clock);
  useEffect(() => {
    if (!iso) return;
    const jump = new Date(iso).getTime();
    const tick = () => setLabel(countdown(jump - Date.now(), clock));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [iso, clock]);
  return <>{label}</>;
}

/**
 * Time to the jump as a stat tile, ticking: the time big, what it means
 * small. The server paints the clock time so the first render matches.
 */
export function JumpTile({ iso, clock, run, title }: { iso?: string; clock: string; run?: boolean; title?: string }) {
  const [label, setLabel] = useState(clock);

  useEffect(() => {
    if (!iso || run) return;
    const jump = new Date(iso).getTime();
    const tick = () => setLabel(countdown(jump - Date.now(), clock));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [iso, clock, run]);

  const [big, small] = run || label === "Run" ? ["Run", "result is in"] : label === "Now" ? ["Now", "jumping"] : label === clock ? [clock, "jump time"] : [label, `to the jump, ${clock}`];
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-2 text-center min-w-40">
      {title && <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft">{title}</div>}
      <div className="font-display text-xl font-extrabold tracking-tight nums leading-tight">{big}</div>
      <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft">{small}</div>
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
