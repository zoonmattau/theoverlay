"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Arrow keys and a sideways swipe move between races at the meeting, and the
 * neighbours are prefetched so the move is instant.
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
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      x0 = t.clientX;
      y0 = t.clientY;
      t0 = Date.now();
    };
    const onEnd = (e: TouchEvent) => {
      // A quick, mostly horizontal flick that did not start on something that scrolls sideways.
      const t = e.changedTouches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (Date.now() - t0 > 600 || Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
      if (e.target instanceof Element && e.target.closest(".overflow-x-auto, .ntg, .race-tabs, .runner-detail-runs, table")) return;
      if (dx < 0 && next) router.push(next);
      if (dx > 0 && prev) router.push(prev);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [router, prev, next]);

  return null;
}
