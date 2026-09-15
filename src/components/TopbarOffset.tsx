"use client";

import { useEffect } from "react";

/**
 * Publishes the top bar's height as --topbar-h, and the offer strip's as
 * --offer-h, so sticky strips can stack under them.
 */
export function TopbarOffset() {
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".topbar");
    if (!bar) return;
    const root = document.documentElement.style;
    const set = () => {
      root.setProperty("--topbar-h", `${bar.offsetHeight}px`);
      root.setProperty("--offer-h", `${document.querySelector<HTMLElement>(".offer-bar")?.offsetHeight ?? 0}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    const mo = new MutationObserver(() => {
      set();
      const offer = document.querySelector<HTMLElement>(".offer-bar");
      if (offer) ro.observe(offer);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
