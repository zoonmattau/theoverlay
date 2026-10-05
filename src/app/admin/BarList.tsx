import Link from "next/link";

export interface BarItem {
  key: string;
  label: React.ReactNode;
  value: number;
  /** A short line after the figure: "12 people". */
  sub?: string;
  /** Where a click on the row goes. */
  href?: string;
  /** Bar colour class; lime when unset. */
  tone?: string;
  /** Picked out: the cut being shown. */
  on?: boolean;
}

/** One row: the label over a bar as long as its share of the biggest, the figure at the end. */
export function BarRow({ item, max }: { item: BarItem; max: number }) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{item.label}</span>
        <span className="nums font-bold whitespace-nowrap">
          {item.value.toLocaleString("en-AU")}
          {item.sub && <span className="font-normal text-ink-soft"> · {item.sub}</span>}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-panel-alt overflow-hidden">
        <div className={`h-full rounded-full ${item.tone ?? "bg-lime"}`} style={{ width: `${Math.max(1.5, (100 * item.value) / Math.max(1, max))}%` }} />
      </div>
    </>
  );
  const cls = `block py-1.5 px-2 -mx-2 rounded-md ${item.on ? "bg-lime-soft" : ""}`;
  return item.href ? <Link href={item.href} className={`${cls} hover:bg-panel-alt`}>{body}</Link> : <div className={cls}>{body}</div>;
}

/**
 * A ranked list as bars, longest first. The first `top` show; the rest sit
 * behind "Show all". Empty says so in one line.
 */
export function BarList({ items, top, empty = "Nothing in the window." }: { items: BarItem[]; top?: number; empty?: string }) {
  if (!items.length) return <p className="text-sm text-ink-soft">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value));
  const shown = top ? items.slice(0, top) : items;
  const rest = top ? items.slice(top) : [];
  return (
    <div>
      {shown.map((i) => <BarRow key={i.key} item={i} max={max} />)}
      {rest.length > 0 && (
        <details className="group/more">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-xs font-semibold text-ink-soft mt-1 group-open/more:hidden">Show all {items.length}</summary>
          {rest.map((i) => <BarRow key={i.key} item={i} max={max} />)}
        </details>
      )}
    </div>
  );
}
