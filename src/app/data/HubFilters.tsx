"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DISTANCES, GOINGS, PERIODS, STATES, filterQuery, type HubFilter } from "@/lib/data/filters";

/**
 * How a ranking is cut: any number of states, tracks (the list narrows to
 * the states as you pick them), goings by number, distances, and a period.
 * Pick what you want and Apply reloads the page with the query; the ranking
 * is cut server-side. A jockey over 1400m and 1600m on Good 4 to Soft 6 in
 * NSW in the last seven days is five clicks.
 */
export function HubFilters({ base, filter, tracks, find }: { base: string; filter: HubFilter; tracks: { track: string; state: string | null; runs: number }[]; find?: string }) {
  const router = useRouter();
  const [states, setStates] = useState<string[]>(filter.states ?? []);
  const [chosen, setChosen] = useState<string[]>(filter.tracks ?? []);
  const [goings, setGoings] = useState<number[]>(filter.goings ?? []);
  const [distances, setDistances] = useState<number[]>(filter.distances ?? []);
  const [period, setPeriod] = useState(filter.period ?? "all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(Boolean(filter.tracks?.length));

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tracks.filter((t) => (states.length === 0 || (t.state !== null && states.includes(t.state))) && (!needle || t.track.toLowerCase().includes(needle))).slice(0, needle ? 40 : 80);
  }, [tracks, states, q]);

  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const apply = () => router.push(`${base}${filterQuery({ states, tracks: chosen, goings: [...goings].sort((a, b) => a - b), distances: [...distances].sort((a, b) => a - b), period }, { find })}`);
  const active = states.length || chosen.length || goings.length || distances.length || (period && period !== "all");
  const chip = (on: boolean) => `px-2 py-0.5 rounded-full border text-xs cursor-pointer select-none ${on ? "bg-ink text-bg border-ink" : "border-line hover:border-ink-soft"}`;

  return (
    <div className="mb-3 text-xs space-y-2">
      <Row label="States" onClear={states.length ? () => { setStates([]); } : undefined}>
        {STATES.map((s) => <button key={s} type="button" className={chip(states.includes(s))} onClick={() => { toggle(states, setStates, s); setChosen((c) => c.filter((t) => { const st = tracks.find((x) => x.track === t)?.state; const next = states.includes(s) ? states.filter((x) => x !== s) : [...states, s]; return next.length === 0 || (st !== null && st !== undefined && next.includes(st)); })); }}>{s}</button>)}
        <button type="button" className={`${chip(false)} ml-1`} onClick={() => setOpen((o) => !o)}>
          {chosen.length === 0 ? "Tracks: all" : chosen.length <= 2 ? `Tracks: ${chosen.join(", ")}` : `Tracks: ${chosen.length} chosen`} {open ? "▴" : "▾"}
        </button>
      </Row>
      {open && (
        <div className="card p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a track" className="field-input py-1 text-xs w-48" aria-label="Find a track" />
            {chosen.length > 0 && <button type="button" className="text-ink-soft underline" onClick={() => setChosen([])}>None</button>}
            <span className="text-ink-soft ml-auto">{chosen.length} chosen</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 gap-y-1">
            {visible.map((t) => (
              <label key={t.track} className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={chosen.includes(t.track)} onChange={() => toggle(chosen, setChosen, t.track)} />
                <span className="truncate">{t.track}</span>
                <span className="text-ink-soft nums">{t.runs.toLocaleString("en-AU")}</span>
              </label>
            ))}
            {visible.length === 0 && <span className="text-ink-soft">No track matches.</span>}
          </div>
        </div>
      )}
      <Row label="Going" onClear={goings.length ? () => setGoings([]) : undefined}>
        {GOINGS.map((g) => <button key={g.n} type="button" className={chip(goings.includes(g.n))} onClick={() => toggle(goings, setGoings, g.n)}>{g.label}</button>)}
        <span className="text-ink-soft ml-1">·</span>
        {(["good", "soft", "heavy"] as const).map((b) => { const ns = GOINGS.filter((g) => g.band === b).map((g) => g.n); const all = ns.every((n) => goings.includes(n)); return <button key={b} type="button" className={chip(all)} onClick={() => setGoings(all ? goings.filter((n) => !ns.includes(n)) : [...new Set([...goings, ...ns])])}>all {b}</button>; })}
      </Row>
      <Row label="Trip" onClear={distances.length ? () => setDistances([]) : undefined}>
        {DISTANCES.map((d) => <button key={d} type="button" className={chip(distances.includes(d))} onClick={() => toggle(distances, setDistances, d)}>{d}</button>)}
      </Row>
      <Row label="Period">
        {PERIODS.map((p) => <button key={p.key} type="button" className={chip(period === p.key)} onClick={() => setPeriod(p.key)}>{p.label}</button>)}
        <button className="btn btn-primary btn-sm ml-2" type="button" onClick={apply}>Apply</button>
        {active ? <button type="button" className="text-ink-soft underline ml-1" onClick={() => router.push(base)}>Clear all</button> : null}
      </Row>
    </div>
  );
}

function Row({ label, children, onClear }: { label: string; children: React.ReactNode; onClear?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold w-12">{label}</span>
      {children}
      {onClear && <button type="button" className="text-ink-soft underline ml-1" onClick={onClear}>none</button>}
    </div>
  );
}
