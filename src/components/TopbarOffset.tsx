"use client";

import { useEffect } from "react";

/** Publishes the top bar's height as --topbar-h so sticky strips can sit under it. */
export function TopbarOffset() {
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".topbar");
    if (!bar) return;
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  return null;
}
