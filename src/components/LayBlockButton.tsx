"use client";

import { useState, useTransition } from "react";

/**
 * Admin only: rules this horse out of the lays for good, or lets it back in.
 * A lay risks the price rather than a unit, so a horse we will not lay stays
 * off every card until it is let back in here.
 */
export function LayBlockButton({
  horse,
  blocked,
  block,
  unblock,
  compact,
}: {
  horse: string;
  blocked: boolean;
  block: (name: string, path?: string, reason?: string) => Promise<void>;
  unblock: (key: string, path?: string) => Promise<void>;
  /** In a list of lays there is no room to ask why; the reason can wait. */
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const path = typeof window === "undefined" ? undefined : window.location.pathname;
  const key = horse.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (compact) {
    return blocked ? (
      <button type="button" className="lay-chip is-on" disabled={pending} title={`Let ${horse} back into the lays`} onClick={() => start(() => unblock(key, path))}>
        {pending ? "…" : "Ruled out"}
      </button>
    ) : (
      <button type="button" className="lay-chip" disabled={pending} title={`Never lay ${horse} again`} onClick={() => start(() => block(horse, path))}>
        {pending ? "…" : "Never lay"}
      </button>
    );
  }

  if (blocked) {
    return (
      <p className="lay-block is-on">
        <span>Ruled out of the lays.</span>
        <button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={() => start(() => unblock(key, path))}>
          {pending ? "Letting back in…" : "Let back in"}
        </button>
      </p>
    );
  }

  if (!asking) {
    return (
      <p className="lay-block">
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAsking(true)}>
          Never lay {horse}
        </button>
      </p>
    );
  }

  return (
    <p className="lay-block">
      <input
        className="field-input flex-1 min-w-0"
        placeholder="Why, for the record"
        maxLength={140}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await block(horse, path, reason);
            setAsking(false);
          })
        }
      >
        {pending ? "Ruling out…" : "Rule out"}
      </button>
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </p>
  );
}
