"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Cell = number | string | null;

export interface Column<Row> {
  key: string;
  label: string;
  tip: string;
  right?: boolean;
  /** The sortable value; strings sort alphabetically, numbers numerically, null last. */
  value: (row: Row) => Cell;
  /** What the cell shows; the value as text when absent. */
  render?: (row: Row) => React.ReactNode;
  strong?: boolean;
  /** Sort this column ascending first, like a name or a time. */
  asc?: boolean;
  /** How a value reads in the column's filter list ("1200m"); the value as text when absent. */
  fmt?: (v: Cell) => string;
}

/** One column's filter: values ticked (by their text), and for numbers a range. */
export interface ColumnFilter {
  in?: string[];
  min?: number;
  max?: number;
}

/** Everything a reader has done to a table, kept in the address so a view can be saved and shared. */
interface Grid {
  q?: string;
  sort?: { key: string; dir: 1 | -1 };
  f?: Record<string, ColumnFilter>;
  hide?: string[];
}

const keyOf = (v: Cell) => (v === null ? "" : String(v));
const LIST_MAX = 400;

/**
 * A table that works like a spreadsheet: search, sort on any heading, and
 * each heading's menu filters that column, ticking values for text (and
 * for numbers with few values, like distances) or a range for numbers.
 * Columns can be hidden. With an `id`, the lot is kept in the address as
 * `grid`, so a saved view or a shared link opens the table as it was left.
 * A row named in `find` is highlighted and scrolled to with its rank.
 */
export function DataTable<Row>({ rows, columns, rowKey, find, searchKeys, defaultSort, noun, note, minRows, id }: {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  /** The row to land on, matched against rowKey, case-insensitive. */
  find?: string;
  /** Which columns the search box searches. */
  searchKeys: string[];
  defaultSort: string;
  noun: string;
  note?: string;
  /** A filter the reader can switch off: rows under this on the column named are hidden by default. */
  minRows?: { key: string; min: number; label: string };
  /** The page's main table: its state goes in the address. */
  id?: string;
}) {
  const params = useSearchParams();
  const [grid, setGrid] = useState<Grid>(() => {
    if (id) {
      try {
        const saved = JSON.parse(params.get("grid") ?? "null") as Grid | null;
        if (saved) return saved;
      } catch {
        // a mangled link opens the table plain
      }
    }
    const c = columns.find((c) => c.key === defaultSort);
    return { sort: { key: defaultSort, dir: c?.asc ? 1 : -1 } };
  });
  const [shown, setShown] = useState(200);
  const [thin, setThin] = useState(false);
  const [menu, setMenu] = useState<{ key: string; at: DOMRect } | null>(null);
  const [cols, setCols] = useState<DOMRect | null>(null);
  const found = useRef<HTMLTableRowElement>(null);
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = find ? norm(find) : undefined;
  const q = grid.q ?? "";
  const sort = useMemo(() => grid.sort ?? { key: defaultSort, dir: -1 as const }, [grid.sort, defaultSort]);
  const filters = useMemo(() => grid.f ?? {}, [grid.f]);
  const hidden = useMemo(() => new Set(grid.hide ?? []), [grid.hide]);

  // Kept in the address without a reload, so Save view and a copied link carry it.
  useEffect(() => {
    if (!id) return;
    const p = new URLSearchParams(window.location.search);
    const plain = !grid.q && !Object.keys(grid.f ?? {}).length && !(grid.hide ?? []).length && (!grid.sort || grid.sort.key === defaultSort);
    if (plain) p.delete("grid");
    else p.set("grid", JSON.stringify(grid));
    const next = p.size ? `?${p}` : window.location.pathname;
    if (next !== window.location.search) window.history.replaceState(null, "", next);
  }, [grid, id, defaultSort]);

  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const searched = searchKeys.map((k) => byKey.get(k)!).filter(Boolean);
    const minCol = minRows ? byKey.get(minRows.key) : undefined;
    const active = Object.entries(filters).map(([k, f]) => [byKey.get(k), f, f.in ? new Set(f.in) : undefined] as const).filter(([c]) => c);
    const out = rows.filter((r) => {
      if (needle && !searched.some((c) => String(c.value(r) ?? "").toLowerCase().includes(needle))) return false;
      for (const [c, f, set] of active) {
        const v = c!.value(r);
        if (set && !set.has(keyOf(v))) return false;
        if ((f.min !== undefined || f.max !== undefined) && (typeof v !== "number" || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max))) return false;
      }
      return thin || !minRows || !minCol || Number(minCol.value(r) ?? 0) >= minRows.min || Boolean(target && norm(rowKey(r)) === target);
    });
    const col = byKey.get(sort.key);
    if (!col) return out;
    const cmp = (a: Row, b: Row) => {
      const x = col.value(a), y = col.value(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "string" || typeof y === "string") return String(x).localeCompare(String(y)) * sort.dir;
      return (x - y) * sort.dir;
    };
    return out.sort((a, b) => cmp(a, b) || rowKey(a).localeCompare(rowKey(b)));
  }, [rows, q, sort, thin, byKey, searchKeys, minRows, rowKey, target, filters]);

  const foundAt = target ? list.findIndex((r) => norm(rowKey(r)) === target) : -1;
  const visible = foundAt >= shown ? foundAt + 20 : shown;
  useEffect(() => {
    found.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [foundAt]);

  const show = columns.filter((c) => !hidden.has(c.key));
  // A column with nothing in it (a links column) has no menu.
  const filterable = useMemo(() => new Set(columns.filter((c) => rows.some((r) => c.value(r) !== null)).map((c) => c.key)), [columns, rows]);
  const setFilter = (key: string, f: ColumnFilter | undefined) =>
    setGrid((g) => {
      const next = { ...(g.f ?? {}) };
      if (!f || (!f.in && f.min === undefined && f.max === undefined)) delete next[key];
      else next[key] = f;
      return { ...g, f: next };
    });
  const sortBy = (key: string, dir?: 1 | -1) =>
    setGrid((g) => ({ ...g, sort: { key, dir: dir ?? (g.sort?.key === key ? (g.sort.dir === 1 ? -1 : 1) : byKey.get(key)?.asc ? 1 : -1) } }));
  const chips = Object.entries(filters).filter(([k]) => byKey.has(k));
  const reset = () => setGrid({ sort: { key: defaultSort, dir: byKey.get(defaultSort)?.asc ? 1 : -1 } });
  const changed = Boolean(q || chips.length || hidden.size);

  return (
    <div className="section">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-line-soft text-xs">
        <input value={q} onChange={(e) => setGrid((g) => ({ ...g, q: e.target.value || undefined }))} placeholder="Search" className="field-input h-8! min-h-0! py-0! text-xs w-48" aria-label="Search" type="search" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => setCols(cols ? null : e.currentTarget.getBoundingClientRect())}>Columns{hidden.size ? ` (${columns.length - hidden.size} of ${columns.length})` : ""}</button>
        {minRows && (
          <label className="flex items-center gap-1.5 text-ink-secondary cursor-pointer">
            <input type="checkbox" checked={thin} onChange={(e) => setThin(e.target.checked)} /> {minRows.label}
          </label>
        )}
        {foundAt >= 0 && <span className="badge badge-prime">{find} is {ordinal(foundAt + 1)} of {list.length}</span>}
        {target && foundAt < 0 && <span className="text-ink-soft">{find} is not in this list.</span>}
        <span className="text-ink-soft ml-auto nums">{list.length === rows.length ? `${rows.length.toLocaleString("en-AU")} ${noun}` : `${list.length.toLocaleString("en-AU")} of ${rows.length.toLocaleString("en-AU")} ${noun}`}</span>
      </div>
      {(chips.length > 0 || changed) && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-line-soft text-xs bg-bg-soft">
          {chips.map(([k, f]) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-ink text-bg pl-2.5 pr-1 py-0.5">
              <button type="button" onClick={(e) => setMenu({ key: k, at: e.currentTarget.getBoundingClientRect() })}>{byKey.get(k)!.label || k}: {chipText(byKey.get(k)!, f)}</button>
              <button type="button" aria-label={`Clear ${byKey.get(k)!.label} filter`} className="rounded-full px-1 hover:bg-white/20" onClick={() => setFilter(k, undefined)}>×</button>
            </span>
          ))}
          {changed && <button type="button" className="text-ink-soft underline ml-1" onClick={reset}>Reset table</button>}
        </div>
      )}
      <div className="overflow-auto max-h-[78vh]">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 w-10 min-w-10 bg-panel-alt border-b border-r border-line px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft">#</th>
              {show.map((c, i) => {
                const on = Boolean(filters[c.key]);
                return (
                  <th key={c.key} className={`sticky top-0 ${i === 0 ? "left-10 z-30" : "z-20"} bg-panel-alt border-b border-r border-line px-2 py-2 whitespace-nowrap ${c.right ? "text-right" : "text-left"}`} title={c.tip} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                    <span className={`inline-flex items-center gap-1 ${c.right ? "flex-row-reverse" : ""}`}>
                      <button type="button" className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft hover:text-ink" onClick={() => sortBy(c.key)}>
                        {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                      </button>
                      {filterable.has(c.key) && <button type="button" aria-label={`Filter ${c.label}`} className={`rounded px-1 leading-none ${on ? "bg-lime text-ink" : "text-ink-soft hover:bg-line-soft hover:text-ink"}`} onClick={(e) => setMenu(menu?.key === c.key ? null : { key: c.key, at: e.currentTarget.getBoundingClientRect() })}>▾</button>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={show.length + 1} className="px-3 py-4 text-ink-soft">Nothing matches.</td></tr>}
            {list.slice(0, visible).map((r, i) => {
              const hit = i === foundAt;
              const bg = hit ? "bg-lime-soft" : i % 2 ? "bg-bg-soft" : "bg-panel";
              return (
                <tr key={rowKey(r)} ref={hit ? found : undefined} className="group">
                  <td className={`sticky left-0 z-10 ${bg} group-hover:bg-panel-alt border-b border-r border-line-soft px-2 py-1.5 nums text-ink-soft text-xs`}>{i + 1}</td>
                  {show.map((c, j) => (
                    <td key={c.key} className={`${j === 0 ? `sticky left-10 z-10 ${bg}` : bg} group-hover:bg-panel-alt border-b border-r border-line-soft px-2 py-1.5 whitespace-nowrap ${c.right ? "text-right nums" : ""} ${c.strong ? "font-semibold" : ""}`}>
                      {c.render ? c.render(r) : text(c.value(r))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > visible && (
        <div className="px-4 py-3 text-center border-t border-line-soft">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShown(visible + 500)}>Show more ({(list.length - visible).toLocaleString("en-AU")} left)</button>
        </div>
      )}
      {note && <p className="border-t border-line bg-bg-soft px-4 py-2 text-xs text-ink-soft">{note}</p>}
      {menu && byKey.get(menu.key) && (
        <ColumnMenu key={menu.key} col={byKey.get(menu.key)!} rows={rows} at={menu.at} filter={filters[menu.key]} sort={sort} onSort={(dir) => sortBy(menu.key, dir)} onFilter={(f) => setFilter(menu.key, f)} onClose={() => setMenu(null)} />
      )}
      {cols && (
        <Popover at={cols} onClose={() => setCols(null)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft mb-1.5">Show columns</p>
          <div className="space-y-1 max-h-72 overflow-auto">
            {columns.map((c) => (
              <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => setGrid((g) => { const h = new Set(g.hide ?? []); if (h.has(c.key)) h.delete(c.key); else h.add(c.key); return { ...g, hide: [...h] }; })} />
                {c.label || c.key}
              </label>
            ))}
          </div>
          {hidden.size > 0 && <button type="button" className="mt-2 text-ink-soft underline" onClick={() => setGrid((g) => ({ ...g, hide: [] }))}>Show all</button>}
        </Popover>
      )}
    </div>
  );
}

/** A heading's menu: sort either way, tick the values to keep, and for numbers a range. */
function ColumnMenu<Row>({ col, rows, at, filter, sort, onSort, onFilter, onClose }: {
  col: Column<Row>; rows: Row[]; at: DOMRect; filter?: ColumnFilter; sort: { key: string; dir: 1 | -1 };
  onSort: (dir: 1 | -1) => void; onFilter: (f: ColumnFilter | undefined) => void; onClose: () => void;
}) {
  const [find, setFind] = useState("");
  const values = useMemo(() => {
    const count = new Map<string, { v: Cell; n: number }>();
    for (const r of rows) {
      const v = col.value(r);
      const k = keyOf(v);
      const cur = count.get(k);
      if (cur) cur.n++;
      else count.set(k, { v, n: 1 });
    }
    return [...count.entries()].sort(([, a], [, b]) => (a.v === null ? 1 : b.v === null ? -1 : typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v))));
  }, [rows, col]);
  const numeric = values.length > 0 && values.every(([, x]) => x.v === null || typeof x.v === "number");
  const listed = values.length > 1 && (numeric ? values.length <= 200 : values.length <= LIST_MAX);
  const label = (v: Cell) => (v === null ? "(blank)" : col.fmt ? col.fmt(v) : typeof v === "number" ? v.toLocaleString("en-AU") : v);
  const needle = find.trim().toLowerCase();
  const shown = needle ? values.filter(([, x]) => label(x.v).toLowerCase().includes(needle)) : values;
  const ticked = new Set(filter?.in ?? values.map(([k]) => k));
  const setIn = (next: Set<string>) => onFilter({ ...filter, in: next.size === values.length ? undefined : [...next] });
  const [min, setMin] = useState(filter?.min !== undefined ? String(filter.min) : "");
  const [max, setMax] = useState(filter?.max !== undefined ? String(filter.max) : "");
  const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));

  return (
    <Popover at={at} onClose={onClose}>
      <div className="flex gap-1 mb-2">
        <button type="button" className={`btn btn-sm flex-1 ${sort.key === col.key && sort.dir === 1 ? "btn-primary" : "btn-secondary"}`} onClick={() => onSort(1)}>{numeric ? "Low to high" : "A to Z"}</button>
        <button type="button" className={`btn btn-sm flex-1 ${sort.key === col.key && sort.dir === -1 ? "btn-primary" : "btn-secondary"}`} onClick={() => onSort(-1)}>{numeric ? "High to low" : "Z to A"}</button>
      </div>
      {numeric && (
        <div className="flex items-center gap-1.5 mb-2">
          <input type="number" inputMode="decimal" value={min} placeholder="Min" aria-label="Lowest" className="field-input h-8! min-h-0! py-0! w-full text-xs nums" onChange={(e) => { setMin(e.target.value); onFilter({ ...filter, min: num(e.target.value) }); }} />
          <span className="text-ink-soft">to</span>
          <input type="number" inputMode="decimal" value={max} placeholder="Max" aria-label="Highest" className="field-input h-8! min-h-0! py-0! w-full text-xs nums" onChange={(e) => { setMax(e.target.value); onFilter({ ...filter, max: num(e.target.value) }); }} />
        </div>
      )}
      {listed && (
        <>
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search values" aria-label="Search values" className="field-input h-8! min-h-0! py-0! w-full text-xs mb-1.5" autoFocus={!numeric} />
          <div className="flex items-center gap-3 mb-1 text-ink-soft">
            <button type="button" className="underline" onClick={() => { const next = new Set(ticked); for (const [k] of shown) next.add(k); setIn(next); }}>Select all</button>
            <button type="button" className="underline" onClick={() => { const next = new Set(ticked); for (const [k] of shown) next.delete(k); setIn(next); }}>Clear</button>
            {needle && <button type="button" className="underline" onClick={() => setIn(new Set(shown.map(([k]) => k)))}>Only these</button>}
          </div>
          <div className="max-h-64 overflow-auto -mx-1 px-1 space-y-0.5">
            {shown.map(([k, x]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer rounded px-1 hover:bg-panel-alt">
                <input type="checkbox" checked={ticked.has(k)} onChange={() => { const next = new Set(ticked); if (next.has(k)) next.delete(k); else next.add(k); setIn(next); }} />
                <span className="truncate flex-1">{label(x.v)}</span>
                <span className="text-ink-soft nums">{x.n.toLocaleString("en-AU")}</span>
              </label>
            ))}
            {shown.length === 0 && <p className="text-ink-soft px-1">No value matches.</p>}
          </div>
        </>
      )}
      {filter && <button type="button" className="mt-2 text-ink-soft underline" onClick={() => { setMin(""); setMax(""); onFilter(undefined); }}>Clear this filter</button>}
    </Popover>
  );
}

/** A small panel under the button that opened it, above the table's scroll; a click outside, Escape or a scroll closes it. */
function Popover({ at, onClose, children }: { at: DOMRect; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const scroll = (e: Event) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); window.removeEventListener("scroll", scroll, true); };
  }, [onClose]);
  const width = 256;
  const left = Math.max(8, Math.min(at.left, window.innerWidth - width - 8));
  return createPortal(
    <div ref={box} style={{ position: "fixed", top: at.bottom + 6, left, width }} className="z-50 rounded-lg border border-line bg-panel p-3 text-xs shadow-xl">
      {children}
    </div>,
    document.body,
  );
}

/** A filter as a chip reads: "Randwick, Rosehill", "4 values", "50 to 200". */
function chipText<Row>(col: Column<Row>, f: ColumnFilter): string {
  const parts: string[] = [];
  if (f.in) {
    const names = f.in.map((k) => (k === "" ? "(blank)" : col.fmt ? col.fmt(Number.isFinite(Number(k)) && k.trim() !== "" ? Number(k) : k) : k));
    parts.push(names.length === 0 ? "none" : names.length <= 3 ? names.join(", ") : `${names.length} values`);
  }
  if (f.min !== undefined && f.max !== undefined) parts.push(`${f.min} to ${f.max}`);
  else if (f.min !== undefined) parts.push(`${f.min}+`);
  else if (f.max !== undefined) parts.push(`up to ${f.max}`);
  return parts.join(" · ");
}

const text = (v: Cell) => (v === null ? "—" : typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-AU") : v.toFixed(1)) : v);
const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
