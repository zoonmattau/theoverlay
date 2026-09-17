"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
}

/**
 * A ranking as a live table: type to filter, click a heading to sort, and a
 * row named in `find` is highlighted and scrolled to with its rank shown,
 * so a click on a jockey chip lands on that jockey. Everything happens in
 * the browser on the rows the server sent.
 */
export function DataTable<Row>({ rows, columns, rowKey, find, searchKeys, defaultSort, noun, note, minRows }: {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  /** The row to land on, matched against rowKey, case-insensitive. */
  find?: string;
  /** Which columns the filter box searches. */
  searchKeys: string[];
  defaultSort: string;
  noun: string;
  note?: string;
  /** A filter the reader can switch off: rows under this on the first numeric column named are hidden by default. */
  minRows?: { key: string; min: number; label: string };
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>(() => {
    const c = columns.find((c) => c.key === defaultSort);
    return { key: defaultSort, dir: c?.asc ? 1 : -1 };
  });
  const [shown, setShown] = useState(100);
  const [thin, setThin] = useState(false);
  const found = useRef<HTMLTableRowElement>(null);
  // Matched on letters and digits alone, so a slug like "illawarra-grange" lands on Illawarra Grange.
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = find ? norm(find) : undefined;

  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const searched = searchKeys.map((k) => byKey.get(k)!).filter(Boolean);
    const minCol = minRows ? byKey.get(minRows.key) : undefined;
    const out = rows.filter((r) =>
      (!needle || searched.some((c) => String(c.value(r) ?? "").toLowerCase().includes(needle))) &&
      (thin || !minRows || !minCol || Number(minCol.value(r) ?? 0) >= minRows.min || (target && norm(rowKey(r)) === target)),
    );
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
  }, [rows, q, sort, thin, byKey, searchKeys, minRows, rowKey, target]);

  // Land on the row asked for, showing enough rows to reach it.
  const foundAt = target ? list.findIndex((r) => norm(rowKey(r)) === target) : -1;
  const visible = foundAt >= shown ? foundAt + 20 : shown;
  useEffect(() => {
    found.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [foundAt]);

  const click = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: byKey.get(key)?.asc ? 1 : -1 }));

  return (
    <div className="section">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line-soft text-xs">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="field-input py-1 text-xs w-48" aria-label="Filter" />
        {minRows && (
          <label className="flex items-center gap-1.5 text-ink-secondary cursor-pointer">
            <input type="checkbox" checked={thin} onChange={(e) => setThin(e.target.checked)} /> {minRows.label}
          </label>
        )}
        {foundAt >= 0 && <span className="badge badge-prime">{find} is {ordinal(foundAt + 1)} of {list.length}</span>}
        {target && foundAt < 0 && <span className="text-ink-soft">{find} is not in this list.</span>}
        <span className="text-ink-soft ml-auto nums">{list.length.toLocaleString("en-AU")} {noun}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table text-sm">
          <thead>
            <tr>
              <th className="w-8">#</th>
              {columns.map((c) => (
                <th key={c.key} className={`${c.right ? "text-right" : ""} cursor-pointer select-none whitespace-nowrap`} onClick={() => click(c.key)} title={c.tip} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={columns.length + 1} className="text-ink-soft">Nothing matches.</td></tr>}
            {list.slice(0, visible).map((r, i) => {
              const hit = i === foundAt;
              return (
                <tr key={rowKey(r)} ref={hit ? found : undefined} className={hit ? "bg-lime-soft" : ""}>
                  <td className="nums text-ink-soft">{i + 1}</td>
                  {columns.map((c) => (
                    <td key={c.key} className={`${c.right ? "text-right nums" : ""} ${c.strong ? "font-semibold" : ""} whitespace-nowrap`}>
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
        <div className="px-4 py-3 text-center">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShown(visible + 200)}>Show more</button>
        </div>
      )}
      {note && <p className="border-t border-line bg-bg-soft px-4 py-2 text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

const text = (v: Cell) => (v === null ? "—" : typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-AU") : v.toFixed(1)) : v);
const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
