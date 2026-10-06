"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataTable, type Column } from "./DataTable";
import { bm, bmGap } from "@/lib/model/display";
import type { HorseSummary } from "@/lib/model/horses";

// Ratings print in benchmark points; a missing rating is a dash.
const pts = (v: number | null | undefined) => (v === null || v === undefined || v < 0 ? null : Math.round(bm(v) * 10) / 10);
const show = (v: number | null) => (v === null ? "—" : v.toFixed(1));
const day = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });

/**
 * The power rankings on the shared grid: every column sorts and filters,
 * state and age by ticking as many as you want. A name opens the horse's
 * page with every run we hold; Add puts it in the race above.
 */
export function HorsesTable({ rows, chosen, total, query, canPick, seen }: { rows: HorseSummary[]; chosen: string[]; total: number; /** The current conditions, carried on every link. */ query: Record<string, string>; canPick: boolean; /** Days since the horse last ran, or "" for all time. */ seen: string }) {
  const router = useRouter();
  const chosenSet = new Set(chosen);
  const addHref = (id: string) => `/data/horses?${new URLSearchParams({ ...query, h: [...chosen.filter((x) => x !== id), id].join(",") })}`;
  const cols: Column<HorseSummary>[] = [
    { key: "name", label: "Horse", tip: "Click a horse for every run we hold.", value: (h) => h.name, strong: true, asc: true, render: (h) => <Link href={`/data/horses/${encodeURIComponent(h.id)}`} className="underline decoration-dotted underline-offset-2">{h.name}</Link> },
    { key: "class", label: "Class", tip: "Class rating in benchmark points, from its last runs.", right: true, value: (h) => pts(h.class), render: (h) => <span className="font-semibold">{show(pts(h.class))}</span> },
    { key: "peak", label: "Best run", tip: "The best single run we have scored it, from the clock and the class of the race.", right: true, value: (h) => pts(h.peak), render: (h) => show(pts(h.peak)) },
    { key: "trend", label: "Trend", tip: "Its last three runs against the three before, in points. Up means improving; it needs two runs each side.", right: true, value: (h) => (h.trend === null ? null : Math.round(bmGap(h.trend) * 10) / 10), render: (h) => <span className={h.trend === null ? "text-ink-soft" : h.trend > 0.5 ? "text-accent" : h.trend < -0.5 ? "text-red" : ""}>{h.trend === null ? "—" : `${h.trend > 0 ? "+" : h.trend < 0 ? "−" : ""}${Math.abs(bmGap(h.trend)).toFixed(1)}${h.trend > 0.5 ? " ↗" : h.trend < -0.5 ? " ↘" : ""}`}</span> },
    { key: "early", label: "Early", tip: "Early sectional rating.", right: true, value: (h) => pts(h.ratings?.early), render: (h) => show(pts(h.ratings?.early)) },
    { key: "mid", label: "Mid", tip: "Mid-race sectional rating.", right: true, value: (h) => pts(h.ratings?.mid), render: (h) => show(pts(h.ratings?.mid)) },
    { key: "late", label: "Late", tip: "Closing sectional rating, the last 600.", right: true, value: (h) => pts(h.ratings?.late), render: (h) => show(pts(h.ratings?.late)) },
    { key: "pressure", label: "Press", tip: "Late rating under a hot early tempo.", right: true, value: (h) => pts(h.ratings?.pressure), render: (h) => show(pts(h.ratings?.pressure)) },
    { key: "good", label: "Good", tip: "Rating on good ground.", right: true, value: (h) => pts(h.ratings?.going.good), render: (h) => show(pts(h.ratings?.going.good)) },
    { key: "soft", label: "Soft", tip: "Rating on soft ground.", right: true, value: (h) => pts(h.ratings?.going.soft), render: (h) => show(pts(h.ratings?.going.soft)) },
    { key: "heavy", label: "Heavy", tip: "Rating on heavy ground.", right: true, value: (h) => pts(h.ratings?.going.heavy), render: (h) => show(pts(h.ratings?.going.heavy)) },
    { key: "starts", label: "Starts", tip: "Career starts.", right: true, value: (h) => h.career?.starts ?? null },
    { key: "wins", label: "Wins", tip: "Career wins.", right: true, value: (h) => h.career?.wins ?? null },
    { key: "winPct", label: "Win %", tip: "Career wins per hundred starts.", right: true, value: (h) => (h.career?.starts ? Math.round((h.career.wins / h.career.starts) * 1000) / 10 : null) },
    { key: "placePct", label: "Place %", tip: "Career top three per hundred starts.", right: true, value: (h) => (h.career?.starts ? Math.round(((h.career.wins + h.career.seconds + h.career.thirds) / h.career.starts) * 1000) / 10 : null) },
    { key: "age", label: "Age", tip: "Age this season.", right: true, value: (h) => h.age ?? null },
    { key: "state", label: "State", tip: "Where it last ran.", value: (h) => h.state ?? null, asc: true },
    { key: "lastTrack", label: "Last track", tip: "Where it last ran on a card we rated.", value: (h) => h.lastTrack ?? null, asc: true },
    { key: "lastSeen", label: "Last seen", tip: "When it last ran on a card we rated.", value: (h) => h.lastSeen, render: (h) => day(h.lastSeen) },
    ...(canPick ? [{ key: "race", label: "Race", tip: "Put it in the race above.", value: (h: HorseSummary) => (chosenSet.has(h.id) ? 1 : 0), render: (h: HorseSummary) => (chosenSet.has(h.id) ? <span className="badge badge-prime">In</span> : <Link href={addHref(h.id)} scroll={false} className="text-xs underline decoration-dotted underline-offset-2">Add</Link>) } satisfies Column<HorseSummary>] : []),
  ];
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Last ran</span>
        {[["", "Any time"], ["30", "30 days"], ["60", "60 days"], ["180", "6 months"]].map(([v, label]) => (
          <button key={v} type="button" onClick={() => router.push(`/data/horses?${new URLSearchParams({ ...query, ...(v ? { seen: v } : {}) })}`)} className={`px-2 py-0.5 rounded-full border ${seen === v ? "bg-ink text-bg border-ink" : "border-line hover:border-ink-soft"}`}>{label}</button>
        ))}
        <span className="text-ink-soft ml-auto">{rows.length < total ? `Top ${rows.length.toLocaleString("en-AU")} of ${total.toLocaleString("en-AU")} rated horses loaded` : ""}</span>
      </div>
      <DataTable id="horses" rows={rows} columns={cols} rowKey={(h) => h.id} searchKeys={["name", "lastTrack"]} defaultSort="class" noun="horses" />
    </>
  );
}
