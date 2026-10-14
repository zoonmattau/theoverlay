"use client";

import { useState } from "react";

import type { AdRow } from "@/lib/ads/report";

type Key = "spend" | "paid" | "perMember" | "back";

const SORTS: { key: Key; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "paid", label: "Members" },
  { key: "perMember", label: "Per member" },
  { key: "back", label: "ROAS" },
];

/** Meta's status as it reads: a deleted ad comes back ARCHIVED, so both say deleted. */
const statusLabel = (status: string) => (status === "ARCHIVED" || status === "DELETED" ? "deleted" : status.toLowerCase().replace(/_/g, " "));
const perMember = (a: AdRow) => (a.paid && a.spend ? a.spend / a.paid : undefined);
const back = (a: AdRow) => (a.spend ? a.revenue / a.spend : undefined);

const value = (a: AdRow, k: Key): number | undefined => (k === "perMember" ? perMember(a) : k === "back" ? back(a) : a[k]);

/**
 * Phone: each ad as a block, since ten columns are unreadable that narrow (12 Oct
 * 2026; the table stays on desktop for clarity): name and spend, a bar for its share of the spend, the funnel from its
 * own link (visits, accounts, members), then what a paying member cost and
 * the ROAS (no trials since 13 Oct 2026). Sort by the buttons; cheapest first for per member,
 * and rows with nothing to sort on go last. An ad that spent nothing and
 * brought nothing is left out.
 */
function ByAdBlocks({ rows }: { rows: AdRow[] }) {
  const [sort, setSort] = useState<Key>("spend");
  const shown = rows.filter((a) => a.spend >= 1 || a.accounts > 0);
  const top = Math.max(...shown.map((a) => a.spend), 1);
  const sorted = [...shown].sort((x, y) => {
    const a = value(x, sort), b = value(y, sort);
    if (a === undefined && b === undefined) return y.spend - x.spend;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return sort === "perMember" ? a - b : b - a;
  });
  return (
    <div className="mt-2">
      <div className="tabs tabs-fit text-xs" role="tablist">
        {SORTS.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={sort === s.key} className="tab" onClick={() => setSort(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-line">
        {sorted.map((a) => {
          const off = a.status && a.status !== "ACTIVE";
          const pm = perMember(a);
          const bk = back(a);
          const funnel = [
            [a.visits, "visits"],
            [a.accounts, a.accounts === 1 ? "account" : "accounts"],
            [a.paid, a.paid === 1 ? "member" : "members"],
          ] as const;
          return (
            <li key={`${a.campaign}-${a.ad}`} className={`py-2.5 ${off ? "opacity-60" : ""}`}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate" title={a.ad}>{a.ad}</div>
                  <div className="text-[11px] text-ink-soft truncate" title={a.campaign}>
                    {a.campaign.replace(/^The Overlay - /, "")}{off ? ` · ${statusLabel(a.status)}` : ""}
                  </div>
                </div>
                <div className="font-display font-extrabold nums text-base shrink-0">{a.spend ? `$${Math.round(a.spend)}` : "$0"}</div>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-line overflow-hidden" aria-hidden>
                <div className="h-full bg-ink" style={{ width: `${(a.spend / top) * 100}%` }} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
                <span className="text-ink-secondary nums">
                  {funnel.map(([n, label], i) => (
                    <span key={label}>
                      {i > 0 && <span className="text-ink-soft"> → </span>}
                      <strong className={n ? "text-ink" : "text-ink-soft font-normal"}>{n}</strong> {label}
                    </span>
                  ))}
                </span>
                <span className="nums whitespace-nowrap">
                  <span className="text-ink-soft">{pm !== undefined ? `$${Math.round(pm)} a member` : a.spend ? "no members" : ""}</span>
                  {bk !== undefined && a.revenue > 0 && <strong className={`ml-2 ${bk >= 1 ? "text-accent" : ""}`}>{bk.toFixed(2)}x ROAS</strong>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The table on desktop, the blocks on a phone. */
export function ByAd({ rows }: { rows: AdRow[] }) {
  return (
    <>
      <div className="hidden sm:block overflow-x-auto -mx-1 px-1">
        {/* Tight: nine columns in half a page. Short headings, little padding, whole dollars where cents add nothing. */}
        <ByAdTable rows={rows} />
      </div>
      <div className="sm:hidden">
        <ByAdBlocks rows={rows} />
      </div>
    </>
  );
}

type TableKey = "ad" | "spend" | "visits" | "accounts" | "paid" | "revenue" | "perVisit" | "perMember" | "back";

const COLS: { key: TableKey; label: string; title?: string }[] = [
  { key: "ad", label: "Ad" },
  { key: "spend", label: "Spend" },
  { key: "visits", label: "Visits", title: "Real visitors from the ad's link; Meta's review bots left out" },
  { key: "accounts", label: "Accts" },
  { key: "paid", label: "Mbr", title: "Paying members" },
  { key: "revenue", label: "Rev", title: "What they have paid, plans and passes" },
  { key: "perVisit", label: "/visit" },
  { key: "perMember", label: "/mbr", title: "Spend per paying member" },
  { key: "back", label: "ROAS", title: "Return on ad spend: what they paid over what the ad cost" },
];

const cell = (a: AdRow, k: TableKey): number | string | undefined => {
  switch (k) {
    case "ad": return a.ad.toLowerCase();
    case "perVisit": return a.visits && a.spend ? a.spend / a.visits : undefined;
    case "perMember": return a.paid && a.spend ? a.spend / a.paid : undefined;
    case "back": return a.spend ? a.revenue / a.spend : undefined;
    default: return a[k];
  }
};

/**
 * Desktop: each ad's spend against what it brought, sortable: a click on a heading
 * sorts by it, a second click turns it round. Rows with nothing to sort on
 * (no members for /mbr, say) go to the bottom either way.
 */
function ByAdTable({ rows }: { rows: AdRow[] }) {
  const [sort, setSort] = useState<{ key: TableKey; desc: boolean }>({ key: "spend", desc: true });
  const sorted = [...rows].sort((x, y) => {
    const a = cell(x, sort.key), b = cell(y, sort.key);
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    const c = typeof a === "string" ? a.localeCompare(String(b)) : a - Number(b);
    return sort.desc ? -c : c;
  });
  const click = (key: TableKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "ad" && key !== "perVisit" && key !== "perMember" }));
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
          const per = cell(a, "perMember") as number | undefined;
          const back = cell(a, "back") as number | undefined;
          return (
            <tr key={`${a.campaign}-${a.ad}`} className={off ? "text-ink-soft" : ""}>
              <td className="max-w-[9rem]">
                <span className="font-semibold block truncate" title={a.ad}>{a.ad}</span>
                <span className="block truncate text-[10px] text-ink-soft" title={a.campaign}>{a.campaign.replace(/^The Overlay - /, "")}{off ? ` · ${statusLabel(a.status)}` : ""}</span>
              </td>
              <td data-label="Spend" className="text-right nums">{a.spend ? `$${Math.round(a.spend)}` : "–"}</td>
              <td data-label="Visits" className="text-right nums">{a.visits || ""}</td>
              <td data-label="Accounts" className="text-right nums">{a.accounts || ""}</td>
              <td data-label="Members" className="text-right nums font-semibold">{a.paid || ""}</td>
              <td data-label="Revenue" className="text-right nums">{a.revenue ? `$${Math.round(a.revenue)}` : ""}</td>
              <td data-label="Per visit" className="text-right nums">{a.visits && a.spend ? `$${(a.spend / a.visits).toFixed(2)}` : ""}</td>
              <td data-label="Per member" className="text-right nums">{per !== undefined ? `$${Math.round(per)}` : a.spend ? "–" : ""}</td>
              <td data-label="ROAS" className={`text-right nums font-semibold ${back !== undefined && back >= 1 ? "text-accent" : ""}`}>{back !== undefined ? `${back.toFixed(2)}x` : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
