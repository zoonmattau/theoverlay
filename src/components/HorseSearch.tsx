"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { SearchHit } from "@/app/api/search/route";

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "";

/** Find a horse on today's card and jump to its race. */
export function HorseSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const term = q.trim();
  const shown = term.length >= 2 ? hits : [];

  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { hits: SearchHit[] }) => {
          setHits(d.hits);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function go(h: SearchHit) {
    setOpen(false);
    setQ("");
    router.push(h.url);
  }

  return (
    <div ref={box} className="search">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => shown.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, shown.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && shown[active]) go(shown[active]);
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search a horse"
        aria-label="Search a horse on today's card"
        className="search-input"
      />
      {open && term.length >= 2 && (
        <ul className="search-menu" role="listbox">
          {shown.length === 0 && <li className="search-empty">Not running today.</li>}
          {shown.map((h, i) => (
            <li key={`${h.url}-${h.tab}`} role="option" aria-selected={i === active}>
              <button type="button" className={`search-hit ${i === active ? "is-active" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
                <span className="font-semibold">
                  {h.tab}. {h.name}
                </span>
                <span className="text-xs text-ink-soft nums">
                  {h.track} R{h.raceNumber}
                  {h.scratched ? " · scratched" : h.resulted ? " · run" : h.jump ? ` · ${fmt(h.jump)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
