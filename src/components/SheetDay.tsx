"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * One day of the results sheet: its subtotal row folds the day's calls away
 * and back, a click or a tap on the row, Enter or Space from the keyboard.
 * An open day carries the column headings under its subtotal row, so a day
 * below a folded one still has them. On a phone a day marked `foldOnPhone`
 * starts folded (seven days of calls ran 15,000px tall, 4 Oct 2026), and a
 * link to the day (#day-yyyy-mm-dd) opens it.
 */
export function SheetDay({ id, cells, head, children, foldOnPhone = false }: { id: string; cells: ReactNode; head: ReactNode; children: ReactNode; foldOnPhone?: boolean }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // The screen width is only known in the browser, so the phone fold happens once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (foldOnPhone && window.matchMedia("(max-width: 640px)").matches && window.location.hash !== `#${id}`) setOpen(false);
    const onHash = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [foldOnPhone, id]);
  const toggle = () => setOpen((o) => !o);
  return (
    <tbody>
      <tr
        id={id}
        className={`sheet-day ${open ? "" : "is-shut"}`}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
      >
        {cells}
      </tr>
      {open && <tr className="sheet-head">{head}</tr>}
      {open && children}
    </tbody>
  );
}
