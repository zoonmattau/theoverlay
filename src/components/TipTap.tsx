"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Every explanation behind a number opens in this one panel: on a phone a
 * tap opens it, on a desktop a hover does. The panel is fixed to the screen,
 * so it cannot drag the page sideways and no section can clip it; the old
 * CSS bubble hung off its element and a speed map chip on the rail, in the
 * bottom lane of a section that hides its overflow, lost its bubble below
 * the edge (21 Sep 2026). A tap on a link or a button is left alone.
 */
export function TipTap() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Centred on what was tapped, then pulled back so the whole panel is on the
  // screen: near an edge the centred box used to hang off the side.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    const half = w / 2;
    const want = Number(el.dataset.x);
    const x = Math.min(Math.max(want, half + 12), window.innerWidth - half - 12);
    el.style.left = `${x}px`;
  }, [tip]);

  useEffect(() => {
    const touch = () => window.matchMedia("(hover: none)").matches || window.innerWidth <= 640;
    const onClick = (e: MouseEvent) => {
      if (!touch()) return;
      const target = e.target as Element | null;
      const el = target?.closest?.("[data-tip]") as HTMLElement | null;
      if (!el || !el.dataset.tip) {
        setTip(null);
        return;
      }
      // Anything that navigates or submits keeps its tap.
      if (el.closest("a, button, summary, input, select, textarea")) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const below = rect.top < window.innerHeight / 2;
      setTip({
        text: el.dataset.tip,
        x: rect.left + rect.width / 2,
        y: below ? rect.bottom + 8 : window.innerHeight - rect.top + 8,
        below,
      });
    };
    // The same panel on hover where there is a pointer: it follows the same geometry as a tap.
    const onOver = (e: MouseEvent) => {
      if (touch()) return;
      const el = (e.target as Element | null)?.closest?.("[data-tip]") as HTMLElement | null;
      if (!el || !el.dataset.tip) return;
      const rect = el.getBoundingClientRect();
      const below = rect.top < window.innerHeight / 2;
      setTip({ text: el.dataset.tip, x: rect.left + rect.width / 2, y: below ? rect.bottom + 8 : window.innerHeight - rect.top + 8, below });
    };
    const onOut = (e: MouseEvent) => {
      if (touch()) return;
      const from = (e.target as Element | null)?.closest?.("[data-tip]");
      const to = (e.relatedTarget as Element | null)?.closest?.("[data-tip]");
      if (from && from !== to) setTip(null);
    };
    const onScroll = () => setTip(null);
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      ref={box}
      className="tip-tap"
      role="tooltip"
      data-x={tip.x}
      style={{ left: tip.x, [tip.below ? "top" : "bottom"]: tip.y }}
      onClick={() => setTip(null)}
    >
      {tip.text}
    </div>
  );
}
