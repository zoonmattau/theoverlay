"use client";

import { useEffect, useState } from "react";

/** Counts down to a jump time, ticking every second. */
export function NextTipTicker({ iso }: { iso: string }) {
  const [left, setLeft] = useState<number>(() => new Date(iso).getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => setLeft(new Date(iso).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [iso]);
  if (left <= 0) return <span className="nums">jumping now</span>;
  const s = Math.floor(left / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return <span className="nums">{h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`}</span>;
}
