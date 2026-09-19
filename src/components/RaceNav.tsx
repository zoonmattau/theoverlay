"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Arrow keys move between races at the meeting, and the neighbours are
 * prefetched so the move is instant. A sideways swipe does nothing: on a
 * phone it fought every table and map that scrolls sideways, so the race
 * tabs in the header are the only way across.
 */
export function RaceNav({ prev, next }: { prev?: string; next?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (prev) router.prefetch(prev);
    if (next) router.prefetch(next);
  }, [router, prev, next]);

  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && /^(input|textarea|select)$/i.test(t.tagName);
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && prev) router.push(prev);
      if (e.key === "ArrowRight" && next) router.push(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prev, next]);

  return null;
}
