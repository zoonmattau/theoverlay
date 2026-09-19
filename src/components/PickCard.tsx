"use client";

import { useState } from "react";

/**
 * One of our top four. A wide screen shows the whole card, as it always has.
 * A phone shows the number, the horse and the two prices, and opens the rest
 * on a tap; the closed state is CSS, so nothing flashes on the way in.
 */
export function PickCard({ top, head, children }: { top: boolean; head: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`pick-card ${top ? "is-top" : ""}`} data-open={open ? "1" : "0"}>
      <button type="button" className="pick-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {head}
        <span className={`pick-caret ${open ? "is-open" : ""}`} aria-hidden="true" />
      </button>
      <div className="pick-body">{children}</div>
    </article>
  );
}
