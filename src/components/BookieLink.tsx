"use client";

import { bestBookie } from "@/lib/bookies";

/**
 * "at Sportsbet" after a price: a link out to the bookie holding it, logged
 * so the admin panel can see which bookies get the clicks.
 */
export function BookieLink({ codes, raceId, prefix = "at ", className = "" }: { codes?: string[]; raceId?: string; prefix?: string; className?: string }) {
  const bookie = bestBookie(codes);
  if (!bookie) return null;
  return (
    <a
      href={bookie.url}
      target="_blank"
      rel="sponsored noopener"
      className={`bookie-link ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        const body = JSON.stringify({ kind: "bookie_click", bookie: bookie.code, raceId });
        if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
          fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
        }
      }}
    >
      {prefix}
      {bookie.name}
    </a>
  );
}
