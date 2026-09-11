"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a page current without a reload: every `seconds` while the tab is
 * visible, and again when it comes back into view, the server components
 * re-render in place. Client state (open runner panels, collapsed sections)
 * survives, so prices, countdowns and results just update.
 */
export function LiveRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      last = Date.now();
      router.refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 15_000) tick();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [router, seconds]);
  return null;
}
