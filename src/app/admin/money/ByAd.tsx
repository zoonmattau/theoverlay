"use client";

import { useState } from "react";

import type { AdRow } from "@/lib/ads/report";

type Key = "ad" | "spend" | "visits" | "accounts" | "trials" | "paid" | "revenue" | "perVisit" | "perTrial" | "back";

const COLS: { key: Key; label: string; title?: string }[] = [
  { key: "ad", label: "Ad" },
  { key: "spend", label: "Spend" },
  { key: "visits", label: "Visits", title: "Real visitors from the ad's link; Meta's review bots left out" },
  { key: "accounts", label: "Accts" },
  { key: "trials", label: "Trials" },
  { key: "paid", label: "Mbr", title: "Paying members" },
  { key: "revenue", label: "Rev", title: "What they have paid, plans and passes" },
  { key: "perVisit", label: "/visit" },
  { key: "perTrial", label: "/trial" },
  { key: "back", label: "$ back", title: "Dollars back per $1 spent" },
];

const value = (a: AdRow, k: Key): number | string | undefined => {
  switch (k) {
    case "ad": return a.ad.toLowerCase();
    case "perVisit": return a.visits && a.spend ? a.spend / a.visits : undefined;
    case "perTrial": return a.trials && a.spend ? a.spend / a.trials : undefined;
    case "back": return a.spend ? a.revenue / a.spend : undefined;
    default: return a[k];
  }
};

/**
 * Each ad's spend against what it brought, sortable: a click on a heading
 * sorts by it, a second click turns it round. Rows with nothing to sort on
 * (no trials for /trial, say) go to the bottom either way.
 */
export function ByAd({ rows }: { rows: AdRow[] }) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "spend", desc: true });
  const sorted = [...rows].sort((x, y) => {
    const a = value(x, sort.key), b = value(y, sort.key);
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    const c = typeof a === "string" ? a.localeCompare(String(b)) : a - Number(b);
    return sort.desc ? -c : c;
  });
  const click = (key: Key) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "ad" && key !== "perVisit" && key !== "perTrial" }));
  return (
    <table className="data-table stack-sm text-[11px] mt-2 [&_th]:px-1 [&_td]:px-1 [&_th]:whitespace-nowrap">
      <thead>
        <tr>
          {COLS.map((c) => (
            <th key={c.key} className={c.key === "ad" ? "" : "text-right"} title={c.title}>
              <button type="button" onClick={() => click(c.key)} className={`hover:text-ink ${sort.key === c.key ? "text-ink" : ""}`}>
                {c.label}{sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((a) => {
          const off = a.status && a.status !== "ACTIVE";
          const per = value(a, "perTrial") as number | undefined;
          const back = value(a, "back") as number | undefined;
          return (
            <tr key={`${a.campaign}-${a.ad}`} className={off ? "text-ink-soft" : ""}>
              <td className="max-w-[9rem]">
                <span className="font-semibold block truncate" title={a.ad}>{a.ad}</span>
                <span className="block truncate text-[10px] text-ink-soft" title={a.campaign}>{a.campaign.replace(/^The Overlay - /, "")}{off ? ` · ${a.status.toLowerCase().replace(/_/g, " ")}` : ""}</span>
              </td>
              <td data-label="Spend" className="text-right nums">{a.spend ? `$${Math.round(a.spend)}` : "–"}</td>
              <td data-label="Visits" className="text-right nums">{a.visits || ""}</td>
              <td data-label="Accounts" className="text-right nums">{a.accounts || ""}</td>
              <td data-label="Trials" className="text-right nums">{a.trials || ""}</td>
              <td data-label="Members" className="text-right nums font-semibold">{a.paid || ""}</td>
              <td data-label="Revenue" className="text-right nums">{a.revenue ? `$${Math.round(a.revenue)}` : ""}</td>
              <td data-label="Per visit" className="text-right nums">{a.visits && a.spend ? `$${(a.spend / a.visits).toFixed(2)}` : ""}</td>
              <td data-label="Per trial" className="text-right nums">{per !== undefined ? `$${Math.round(per)}` : a.spend ? "–" : ""}</td>
              <td data-label="Back per $1" className={`text-right nums font-semibold ${back !== undefined && back >= 1 ? "text-accent" : ""}`}>{back !== undefined ? `$${back.toFixed(2)}` : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
