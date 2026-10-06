"use client";

import Link from "next/link";

import { DataTable, type Column } from "./DataTable";
import type { HorseRun } from "@/lib/data/horse";

const day = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const link = "underline decoration-dotted underline-offset-2";

/** A horse's runs on the shared grid: every column sorts and filters, track and distance by ticking. */
export function HorseRunsTable({ rows }: { rows: HorseRun[] }) {
  const cols: Column<HorseRun>[] = [
    { key: "date", label: "Date", tip: "", value: (r) => r.date, render: (r) => day(r.date) },
    { key: "track", label: "Track", tip: "Click for the track's page.", value: (r) => r.track, asc: true, render: (r) => (r.track ? <Link href={`/data/tracks/${encodeURIComponent(r.track)}`} className={link}>{r.track}</Link> : "—") },
    { key: "state", label: "State", tip: "", value: (r) => r.state, asc: true },
    { key: "distance", label: "Trip", tip: "Click for the distance's page.", right: true, value: (r) => r.distance, asc: true, fmt: (v) => `${v}m`, render: (r) => (r.distance ? <Link href={`/data/distances/${r.distance}`} className={link}>{r.distance}m</Link> : "—") },
    { key: "going", label: "Going", tip: "", value: (r) => r.going, asc: true },
    { key: "race", label: "Race", tip: "", value: (r) => r.raceName, asc: true, render: (r) => <span className="text-xs text-ink-secondary">{r.raceName ?? "—"}</span> },
    { key: "finish", label: "Finish", tip: "", right: true, value: (r) => r.finish, asc: true, render: (r) => (r.finish === null ? "—" : <span className={r.finish === 1 ? "font-semibold text-accent" : ""}>{ord(r.finish)}{r.runners ? ` of ${r.runners}` : ""}</span>) },
    { key: "margin", label: "Beaten", tip: "Lengths.", right: true, value: (r) => r.margin, asc: true, render: (r) => (r.margin === null ? "—" : r.finish === 1 ? "won" : `${r.margin.toFixed(1)}L`) },
    { key: "weight", label: "Wgt", tip: "Weight carried, kg.", right: true, value: (r) => r.weight },
    { key: "barrier", label: "Bar", tip: "Barrier.", right: true, value: (r) => r.barrier, asc: true },
    { key: "sp", label: "SP", tip: "Starting price.", right: true, value: (r) => r.sp, asc: true, render: (r) => (r.sp ? `$${r.sp.toFixed(2)}` : "—") },
    { key: "bsp", label: "BSP", tip: "Betfair starting price.", right: true, value: (r) => r.bsp, asc: true, render: (r) => (r.bsp ? `$${r.bsp.toFixed(2)}` : "—") },
    { key: "last600", label: "L600", tip: "Last 600 metres, seconds.", right: true, value: (r) => r.last600, asc: true, render: (r) => (r.last600 ? r.last600.toFixed(2) : "—") },
    { key: "vsBench", label: "v Bench", tip: "Lengths quicker (+) or slower (−) than the class benchmark, when timed.", right: true, value: (r) => r.vsBench, render: (r) => (r.vsBench === null ? "—" : <span className={r.vsBench > 0 ? "text-accent" : r.vsBench < 0 ? "text-red" : ""}>{`${r.vsBench > 0 ? "+" : r.vsBench < 0 ? "−" : ""}${Math.abs(r.vsBench).toFixed(1)}L`}</span>) },
    { key: "jockey", label: "Jockey", tip: "Click for their profile.", value: (r) => r.jockey, asc: true, render: (r) => (r.jockey && r.jockeyKey ? <Link href={`/data/jockeys/${encodeURIComponent(r.jockeyKey)}`} className={link}>{r.jockey}</Link> : (r.jockey ?? "—")) },
    { key: "trainer", label: "Trainer", tip: "Click for their profile.", value: (r) => r.trainer, asc: true, render: (r) => (r.trainer && r.trainerKey ? <Link href={`/data/trainers/${encodeURIComponent(r.trainerKey)}`} className={link}>{r.trainer}</Link> : (r.trainer ?? "—")) },
  ];
  return <DataTable id="runs" rows={rows} columns={cols} rowKey={(r) => `${r.date}|${r.track}|${r.raceId}`} searchKeys={["track", "race", "jockey", "trainer", "going"]} defaultSort="date" noun="runs" />;
}
