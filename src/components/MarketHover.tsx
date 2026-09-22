"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { bestBookie, bookieName } from "@/lib/bookies";
import { price } from "@/lib/format";

export interface MarketDetail {
  marketPrice?: number;
  /** The exchange price a lay is struck at, when the runner carries one. */
  layPrice?: number;
  bookies?: string[];
  marketAvg?: number;
  marketOpen?: number;
  /** Percentage points of implied chance since open, negative is a drift. */
  marketMove?: number;
  /** When Form King last saw the price move. */
  marketAt?: string;
  /** Named on the phone's sheet, which sits away from the price that was tapped. */
  tabNumber?: number;
  horseName?: string;
}

/**
 * Hover or tap a live price for the market behind it: who holds the best
 * price, the average across bookies, where it opened and which way it has
 * moved, and when the price was last seen.
 */
export function MarketHover({ r, children, className = "" }: { r: MarketDetail; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  // Opens upward when the panel would run off the bottom of the screen: the
  // last rows of the tips page lost the foot of it (22 Sep 2026).
  const [up, setUp] = useState(false);
  const pop = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) {
      setUp(false);
      return;
    }
    const rect = el.getBoundingClientRect();
    setUp(rect.bottom > window.innerHeight - 8 && rect.top - rect.height > 8);
  }, [open]);
  if (!r.marketPrice) return <>{children}</>;
  const best = bestBookie(r.bookies);
  const holders = (r.bookies ?? []).map(bookieName).filter(Boolean);
  const move = r.marketMove;
  const moveText = move === undefined ? "" : Math.abs(move) < 0.5 ? "holding" : move > 0 ? `firmed ${move.toFixed(1)} pts` : `drifted ${Math.abs(move).toFixed(1)} pts`;
  return (
    <span
      className={`market-hover ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        // A tap opens the detail without following the card's link or toggling the row.
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }}
    >
      {children}
      {open && (
        <span
          ref={pop}
          className={`market-pop ${up ? "is-up" : ""}`}
          role="tooltip"
          onClick={(e) => {
            // On a phone the panel is a sheet, and a tap on it is how it closes.
            e.stopPropagation();
            setOpen(false);
          }}
        >
          {r.horseName && <span className="market-title sm:hidden">{r.tabNumber ? `${r.tabNumber}. ` : ""}{r.horseName}</span>}
          <span className="market-row">
            <span className="market-k">Best</span>
            <span className="market-v nums">{price(r.marketPrice)}</span>
          </span>

          {holders.length > 0 && (
            <span className="market-holders">{best ? [best.name, ...holders.filter((h) => h !== best.name)].join(", ") : holders.join(", ")}</span>
          )}
          {r.layPrice ? (
            <span className="market-row">
              <span className="market-k">Lay at</span>
              <span className="market-v nums">{price(r.layPrice)}</span>
            </span>
          ) : null}
          {r.marketAvg ? (
            <span className="market-row">
              <span className="market-k">Average</span>
              <span className="market-v nums">{price(r.marketAvg)}</span>
            </span>
          ) : null}
          {r.marketOpen && r.marketOpen > 1.05 ? (
            <span className="market-row">
              <span className="market-k">Opened</span>
              <span className="market-v nums">
                {price(r.marketOpen)}{moveText && <span className="market-move"> {moveText}</span>}
              </span>
            </span>
          ) : null}
          <span className="market-row">
            <span className="market-k">Updated</span>
            <span className="market-v nums">{updated(r.marketAt)}</span>
          </span>
        </span>
      )}
    </span>
  );
}

function updated(iso?: string): string {
  if (!iso) return "unknown";
  const at = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - at.getTime()) / 60_000));
  const clock = at.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 24 * 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m ago` : `${Math.floor(mins / 1440)}d ago`;
  return `${clock}, ${ago}`;
}
