"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A phone cannot hover, so the explanations behind every number were out of
 * reach: tapping one now opens it in a panel anchored to what was tapped.
 * The panel is fixed, so unlike the hover bubble it cannot drag the page
 * sideways. A tap on a link or a button is left alone.
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
    const onScroll = () => setTip(null);
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("click", onClick, true);
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
