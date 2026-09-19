"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A page section with the black bar on top. The bar collapses the body, and
 * the choice is remembered per section in this browser. Anything interactive
 * inside the bar (tabs, tooltips) sits in `controls` so a click there does
 * not toggle the section.
 */
export function Section({
  id,
  letter,
  title,
  aside,
  controls,
  children,
  className = "",
  defaultOpen = true,
}: {
  id: string;
  letter: string;
  title: ReactNode;
  aside?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // The saved state lives in the browser, so it can only be read after
  // hydration; one setState here is the price of a server-rendered default.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`overlay.section.${id}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "closed" || saved === "open") setOpen(saved === "open");
    } catch {
      // storage blocked, the default stands
    }
  }, [id]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(`overlay.section.${id}`, next ? "open" : "closed");
    } catch {
      // ignore
    }
  }

  return (
    <section className={`section ${className}`}>
      <div
        className="section-bar is-toggle"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span className="section-letter">{letter}</span>
        <h2>{title}</h2>
        {/* Closed, the section shows its name and nothing else: its tabs and
            filters belong to the body and go with it. */}
        {controls && open && (
          <span className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {controls}
          </span>
        )}
        {aside && (
          <span className="aside" onClick={(e) => e.stopPropagation()}>
            {aside}
          </span>
        )}
        <span className={`section-caret ${open ? "is-open" : ""}`} aria-hidden="true">
          ▾
        </span>
      </div>
      {open && children}
    </section>
  );
}
