"use client";

import { usePathname, useRouter } from "next/navigation";

import { filterParams, PRICE_BANDS, RESULT_FILTERS, type ResultsFilter } from "@/lib/results-filter";

/**
 * Every call's filters, result, track and price band, beside the period and
 * side tabs above, and the CSV of exactly what is showing.
 */
export function ResultsFilters({ filter, tracks, count }: { filter: ResultsFilter; tracks: string[]; count: number }) {
  const router = useRouter();
  const path = usePathname();
  const set = (k: "result" | "track" | "price", v: string) => {
    const q = filterParams({ ...filter, [k]: v || undefined });
    router.replace(q.size ? `${path}?${q}` : path, { scroll: false });
  };
  const csv = filterParams(filter);
  csv.set("download", "1");
  const any = filter.result || filter.track || filter.price;

  return (
    <div className="flex flex-wrap items-end gap-2 mb-3 text-sm">
      <label className="field">
        <span>Result</span>
        <select value={filter.result ?? ""} onChange={(e) => set("result", e.target.value)} className="field-input">
          <option value="">Won and lost</option>
          {RESULT_FILTERS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Track</span>
        <select value={filter.track ?? ""} onChange={(e) => set("track", e.target.value)} className="field-input">
          <option value="">Every track</option>
          {tracks.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Price</span>
        <select value={filter.price ?? ""} onChange={(e) => set("price", e.target.value)} className="field-input">
          <option value="">Any price</option>
          {PRICE_BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </label>
      {any && (
        <button type="button" onClick={() => router.replace(`${path}?${filterParams({ period: filter.period, side: filter.side })}`, { scroll: false })} className="pb-2 text-xs text-ink-soft underline">
          Clear
        </button>
      )}
      <a href={`/api/results.csv?${csv}`} className="btn btn-secondary btn-sm ml-auto" download>
        Download CSV ({count.toLocaleString("en-AU")})
      </a>
    </div>
  );
}
