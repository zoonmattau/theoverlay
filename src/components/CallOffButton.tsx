"use client";

import { useTransition } from "react";

/**
 * Admin only: takes a call off today's card, or puts it back. It is the day's
 * card this touches, not a mark against the horse, so tomorrow the model
 * decides again.
 */
export function CallOffButton({
  date,
  raceId,
  tab,
  horse,
  side,
  off,
  setOff,
  compact,
}: {
  date: string;
  raceId: string;
  tab: number;
  horse: string;
  /** What the call is, for the wording. */
  side: "back" | "lay";
  off: boolean;
  setOff: (date: string, raceId: string, tab: number, off: boolean, path?: string) => Promise<void>;
  /** In a list there is no room for a sentence. */
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const path = typeof window === "undefined" ? undefined : window.location.pathname;
  const word = side === "lay" ? "lay" : "bet";
  const go = (next: boolean) => start(() => setOff(date, raceId, tab, next, path));

  if (compact) {
    return off ? (
      <button type="button" className="lay-chip is-on" disabled={pending} title={`Put the ${word} on ${horse} back on today's card`} onClick={() => go(false)}>
        {pending ? "…" : "Off today"}
      </button>
    ) : (
      <button type="button" className="lay-chip" disabled={pending} title={`Take the ${word} on ${horse} off today's card`} onClick={() => go(true)}>
        {pending ? "…" : `No ${word} today`}
      </button>
    );
  }

  return off ? (
    <p className="lay-block is-on">
      <span>Off today&apos;s card. Tomorrow the numbers decide again.</span>
      <button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={() => go(false)}>
        {pending ? "Putting it back…" : "Put it back"}
      </button>
    </p>
  ) : (
    <p className="lay-block">
      <button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={() => go(true)}>
        {pending ? "Taking it off…" : `Take this ${word} off today`}
      </button>
    </p>
  );
}
