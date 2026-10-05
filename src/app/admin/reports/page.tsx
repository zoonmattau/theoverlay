import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DayChart, DayTable } from "@/components/DayChart";
import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { daysSinceLaunch, growthSeries, modelTipSeries, tipsterTipSeries, windowStart, type Series } from "@/lib/reports";
import { windowStats } from "@/lib/tips";
import type { SideStats } from "@/lib/tips/stats";

export const metadata: Metadata = { title: "Reports", robots: { index: false } };

const TABS = [
  { id: "growth", label: "Sign-ups and money" },
  { id: "tips", label: "Model tips" },
  { id: "tipsters", label: "Tipsters" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const WINDOWS = [7, 14, 30, 90] as const;

export default function Page({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Reports({ searchParams }: { searchParams: PageProps<"/admin/reports">["searchParams"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "growth";
  // A window in days, or every day since the first account ("all").
  const all = sp.days === "all";
  const n = all ? await daysSinceLaunch() : WINDOWS.includes(Number(sp.days) as (typeof WINDOWS)[number]) ? Number(sp.days) : 30;
  const current = all ? "all" : String(n);
  const href = (t: Tab, d: string = current) => `/admin/reports?tab=${t}&days=${d}`;

  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-ink-soft">One bar a day, Sydney time. Hover a bar for the number, or open the table under each group.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Window">
          {WINDOWS.map((d) => (
            <Link key={d} href={href(tab, String(d))} className={`btn btn-sm ${!all && d === n ? "btn-primary" : "btn-secondary"}`}>{d} days</Link>
          ))}
          <Link href={href(tab, "all")} className={`btn btn-sm ${all ? "btn-primary" : "btn-secondary"}`}>All time</Link>
        </div>
      </section>

      <div className="tabs mb-5" role="tablist">
        {TABS.map((t) => (
          <Link key={t.id} href={href(t.id)} role="tab" aria-selected={t.id === tab} className="tab">{t.label}</Link>
        ))}
      </div>

      {tab === "growth" && <Growth n={n} />}
      {tab === "tips" && <ModelTips n={n} all={all} />}
      {tab === "tipsters" && <Tipsters n={n} />}
    </>
  );
}

function Group({ title, series, cumulativeKeys = [], collapsible }: { title?: string; series: Series[]; cumulativeKeys?: string[]; collapsible?: boolean }) {
  const body = (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {series.map((s) => (
          <DayChart key={s.key} s={s} cumulative={cumulativeKeys.includes(s.key)} />
        ))}
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-semibold text-ink-soft">The numbers</summary>
        <div className="mt-2"><DayTable series={series} /></div>
      </details>
    </>
  );
  if (collapsible && title) {
    const units = series.find((s) => s.format === "units");
    return (
      <details className="card mb-4">
        <summary className="cursor-pointer flex flex-wrap items-baseline justify-between gap-3">
          <span className="font-display font-extrabold">{title}</span>
          <span className="nums text-sm text-ink-soft">
            {series.find((s) => s.format === "count")?.total ?? 0} calls{units ? `, ${units.total > 0 ? "+" : units.total < 0 ? "−" : ""}${Math.abs(units.total).toFixed(1)}u` : ""}
          </span>
        </summary>
        <div className="mt-3">{body}</div>
      </details>
    );
  }
  return (
    <div className="card mb-4">
      {title && <h2 className="font-display font-extrabold mb-3">{title}</h2>}
      {body}
    </div>
  );
}

async function Growth({ n }: { n: number }) {
  const series = await growthSeries(n);
  return <Group series={series} />;
}

async function ModelTips({ n, all }: { n: number; all: boolean }) {
  const [series, record] = await Promise.all([modelTipSeries(n), windowStats(windowStart(n), "model")]);
  const units = series.find((s) => s.key === "units")!;
  return (
    <>
      <Group series={series} />
      <Group title="Units, running total" series={[units]} cumulativeKeys={["units"]} />
      <Pot record={record} label={all ? "All time" : `Last ${n} days`} />
    </>
  );
}

const pot = (units: number, staked: number) => (staked ? `${units > 0 ? "+" : units < 0 ? "−" : ""}${Math.abs((units / staked) * 100).toFixed(1)}%` : "—");
const signed = (u: number) => `${u > 0 ? "+" : u < 0 ? "−" : ""}${Math.abs(u).toFixed(2)}u`;

const tone = (u: number) => (u > 0 ? "text-accent" : u < 0 ? "text-red" : "");

function Cell({ name, n, units, staked, strong }: { name: string; n: number; units: number; staked: number; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft">{name}</div>
      <div className={`nums text-lg ${strong ? "font-extrabold" : "font-bold"} ${tone(units)}`}>{signed(units)}</div>
      <div className="nums text-xs text-ink-soft">{n} calls</div>
      <div className={`nums text-xs font-semibold ${tone(units)}`}>{pot(units, staked)}</div>
    </div>
  );
}

/** Profit on turnover over the window picked at the top, the same days as the charts: units won over units staked. */
function Pot({ record, label }: { record: { bets: SideStats; lays: SideStats }; label: string }) {
  const { bets, lays } = record;
  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-display font-extrabold">Profit on turnover</h2>
        <span className="text-xs font-semibold text-ink-soft">{label}</span>
      </div>
      <p className="text-xs text-ink-soft mb-3">Units won over units staked. A bet stakes one unit, a tenth on a Way; a lay stakes the unit it wins.</p>
      <div className="grid grid-cols-3 gap-3">
        <Cell name="Bets" n={bets.n} units={bets.units} staked={bets.staked} />
        <Cell name="Lays" n={lays.n} units={lays.units} staked={lays.staked} />
        <Cell name="Overall" n={bets.n + lays.n} units={bets.units + lays.units} staked={bets.staked + lays.staked} strong />
      </div>
    </div>
  );
}

async function Tipsters({ n }: { n: number }) {
  const { all, byTipster } = await tipsterTipSeries(n);
  return (
    <>
      <Group title="All tipsters" series={all} />
      {byTipster.map((t) => (
        <Group key={t.code} title={`${t.name} (${t.code})`} series={t.series} collapsible />
      ))}
      {byTipster.length === 0 && <p className="text-sm text-ink-soft">No tipsters yet.</p>}
    </>
  );
}
