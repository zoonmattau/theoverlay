"use client";

import { useState, type ReactNode } from "react";

/**
 * One day of the results sheet: its subtotal row folds the day's calls away
 * and back, a click or a tap on the row, Enter or Space from the keyboard.
 */
export function SheetDay({ id, cells, children }: { id: string; cells: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
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
      {open && children}
    </tbody>
  );
}
