"use client";

import { useEffect } from "react";

/** Publishes the sticky header's height (top bar plus any offer strip) as --topbar-h so sticky strips can sit under it. */
export function TopbarOffset() {
  useEffect(() => {
    const head = document.querySelector<HTMLElement>(".site-head");
    if (!head) return;
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${head.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);
  return null;
}
