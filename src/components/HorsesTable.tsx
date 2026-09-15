"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { HorseSummary } from "@/lib/model/horses";

type Key = "name" | "class" | "early" | "mid" | "late" | "pressure" | "good" | "soft" | "heavy" | "age" | "lastSeen" | "runs";

const COLS: { key: Key; label: string; right?: boolean; tip: string }[] = [
  { key: "name", label: "Horse", tip: "Click a row to add it to the race." },
  { key: "class", label: "Class", right: true, tip: "Class rating in benchmark points, from its last runs." },
  { key: "early", label: "Early", right: true, tip: "Early sectional rating." },
  { key: "mid", label: "Mid", right: true, tip: "Mid-race sectional rating." },
  { key: "late", label: "Late", right: true, tip: "Closing sectional rating, the last 600." },
  { key: "pressure", label: "Press", right: true, tip: "Late rating under a hot early tempo." },
  { key: "good", label: "Good", right: true, tip: "Rating on good ground." },
  { key: "soft", label: "Soft", right: true, tip: "Rating on soft ground." },
  { key: "heavy", label: "Heavy", right: true, tip: "Rating on heavy ground." },
  { key: "runs", label: "Runs", right: true, tip: "Runs the rating is built on." },
  { key: "age", label: "Age", right: true, tip: "Age this season." },
  { key: "lastSeen", label: "Last seen", tip: "Where and when it last ran on a card we rated." },
];

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

function value(h: HorseSummary, key: Key): number | string {
  const g = h.ratings;
  switch (key) {
    case "name": return h.name;
    case "class": return h.class ?? -1;
    case "early": return g?.early ?? -1;
    case "mid": return g?.mid ?? -1;
    case "late": return g?.late ?? -1;
    case "pressure": return g?.pressure ?? -1;
    case "good": return g?.going.good ?? -1;
    case "soft": return g?.going.soft ?? -1;
    case "heavy": return g?.going.heavy ?? -1;
    case "runs": return g?.runs ?? 0;
    case "age": return h.age ?? 0;
    case "lastSeen": return h.lastSeen;
  }
}

const fmt = (v: number | string) => (typeof v === "number" ? (v < 0 ? "—" : v.toFixed(1)) : v);
const day = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/**
 * The power rankings as a live table: type to filter, click a heading to
 * sort, click a row to put the horse in the race. Everything happens in the
 * browser on the rows the server sent.
 */
export function HorsesTable({ rows, chosen, total, query, canPick }: { rows: HorseSummary[]; chosen: string[]; total: number; /** The current conditions, carried on every link. */ query: Record<string, string>; canPick: boolean }) {
  const router = useRouter();
  const hrefFor = (id: string) => {
    const p = new URLSearchParams({ ...query, h: [...chosen.filter((x) => x !== id), id].join(",") });
    return `/horses?${p}`;
  };
  const [q, setQ] = useState("");
  const [state, setState] = useState("all");
  const [age, setAge] = useState("all");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "class", dir: -1 });
  const [shown, setShown] = useState(100);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((h) =>
      (!needle || h.name.toLowerCase().includes(needle)) &&
      (state === "all" || h.state === state) &&
      (age === "all" || (age === "2" ? h.age === 2 : age === "3" ? h.age === 3 : age === "4" ? h.age === 4 : (h.age ?? 0) >= 5)),
    );
    const cmp = (a: HorseSummary, b: HorseSummary) => {
      const x = value(a, sort.key), y = value(b, sort.key);
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y);
      return Number(x) - Number(y);
    };
    return out.sort((a, b) => sort.dir * cmp(a, b) || a.name.localeCompare(b.name));
  }, [rows, q, state, age, sort]);

  const click = (key: Key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));
  const chosenSet = new Set(chosen);

  return (
    <div className="section">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line-soft text-xs">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" className="field-input py-1 text-xs w-48" aria-label="Filter by name" />
        <select value={state} onChange={(e) => setState(e.target.value)} className="field-input py-1 text-xs" aria-label="State">
          <option value="all">All states</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={age} onChange={(e) => setAge(e.target.value)} className="field-input py-1 text-xs" aria-label="Age">
          <option value="all">Any age</option>
          <option value="2">2yo</option>
          <option value="3">3yo</option>
          <option value="4">4yo</option>
          <option value="5">5yo and up</option>
        </select>
        <span className="text-ink-soft ml-auto nums">{list.length.toLocaleString("en-AU")} of {total.toLocaleString("en-AU")} rated horses{rows.length < total ? `, top ${rows.length.toLocaleString("en-AU")} loaded` : ""}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table text-sm">
          <thead>
            <tr>
              <th className="w-8">#</th>
              {COLS.map((c) => (
                <th key={c.key} className={`${c.right ? "text-right" : ""} cursor-pointer select-none`} onClick={() => click(c.key)} title={c.tip} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={COLS.length + 2} className="text-ink-soft">No horse matches.</td></tr>}
            {list.slice(0, shown).map((h, i) => {
              const inRace = chosenSet.has(h.id);
              return (
                <tr key={h.id} className={`${canPick ? "cursor-pointer" : ""} ${inRace ? "bg-lime-soft" : ""}`} onClick={() => canPick && !inRace && router.push(hrefFor(h.id))} title={canPick ? (inRace ? "In the race" : "Add to the race") : undefined}>
                  <td className="nums text-ink-soft">{i + 1}</td>
                  <td className="font-semibold">{h.name}</td>
                  <td className="text-right nums font-semibold">{fmt(value(h, "class"))}</td>
                  <td className="text-right nums">{fmt(value(h, "early"))}</td>
                  <td className="text-right nums">{fmt(value(h, "mid"))}</td>
                  <td className="text-right nums">{fmt(value(h, "late"))}</td>
                  <td className="text-right nums">{fmt(value(h, "pressure"))}</td>
                  <td className="text-right nums">{fmt(value(h, "good"))}</td>
                  <td className="text-right nums">{fmt(value(h, "soft"))}</td>
                  <td className="text-right nums">{fmt(value(h, "heavy"))}</td>
                  <td className="text-right nums text-ink-soft">{h.ratings?.runs ?? "—"}</td>
                  <td className="text-right nums">{h.age ?? "—"}</td>
                  <td className="text-xs text-ink-secondary whitespace-nowrap">{h.lastTrack ?? "—"}, {day(h.lastSeen)}</td>
                  <td className="text-right">{canPick ? (inRace ? <span className="badge badge-prime">In</span> : <span className="text-xs text-ink-soft">Add</span>) : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > shown && (
        <div className="px-4 py-3 text-center">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShown((n) => n + 100)}>Show 100 more</button>
        </div>
      )}
    </div>
  );
}
