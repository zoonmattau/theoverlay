"use client";

import { useRef, useState } from "react";

import { MAP_LABEL } from "./Ratings";
import type { MapPosition, PublishedRace, PublishedRunner } from "@/lib/model/types";

const COLUMNS: MapPosition[] = ["back", "midfield", "on pace", "leader"];

/**
 * Hover a runner's map position for a small speed map of the whole field,
 * saddlecloths only, with this runner lit up so you can see who it settles
 * with and who it has to get past.
 */
export function MapHover({ race, runner, children, className = "" }: { race: PublishedRace; runner: PublishedRunner; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const show = () => {
    // Open to the left when there is no room on the right.
    const box = ref.current?.getBoundingClientRect();
    setFlip(Boolean(box && box.left + 280 > window.innerWidth));
    setOpen(true);
  };
  const live = race.runners.filter((r) => !r.scratched);
  const columns = COLUMNS.map((col) => ({ col, group: live.filter((r) => r.ratings.map === col).sort((a, b) => b.barrier - a.barrier) }));
  return (
    <span ref={ref} className={`map-hover ${className}`} onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <span className={`map-pop ${flip ? "is-left" : ""}`} role="tooltip">
          <span className="map-pop-title">{runner.tabNumber}. {runner.horseName} settles {MAP_LABEL[runner.ratings.map].toLowerCase()}</span>
          <span className="map-pop-field">
            {columns.map(({ col, group }) => (
              <span key={col} className="map-pop-col">
                <span className="map-pop-label">{MAP_LABEL[col]}</span>
                {group.map((r) => (
                  <span key={r.tabNumber} className={`map-pop-cloth ${r.tabNumber === runner.tabNumber ? "is-me" : ""}`} title={r.horseName}>
                    {r.tabNumber}
                  </span>
                ))}
              </span>
            ))}
          </span>
          <span className="map-pop-rail">rail, running this way →</span>
        </span>
      )}
    </span>
  );
}
