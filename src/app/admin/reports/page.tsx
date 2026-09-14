import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DayChart, DayTable } from "@/components/DayChart";
import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { growthSeries, modelTipSeries, tipsterTipSeries, type Series } from "@/lib/reports";

export const metadata: Metadata = { title: "Reports", robots: { index: false } };

const TABS = [
  { id: "growth", label: "Sign-ups and money" },
  { id: "tips", label: "Model tips" },
  { id: "tipsters", label: "Tipsters" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const WINDOWS = [14, 30, 90] as const;

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
  const n = WINDOWS.includes(Number(sp.days) as (typeof WINDOWS)[number]) ? Number(sp.days) : 30;
  const href = (t: Tab, d = n) => `/admin/reports?tab=${t}&days=${d}`;

  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-ink-soft">One bar a day, Sydney time. Hover a bar for the number, or open the table under each group.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Window">
          {WINDOWS.map((d) => (
            <Link key={d} href={href(tab, d)} className={`btn btn-sm ${d === n ? "btn-primary" : "btn-secondary"}`}>{d} days</Link>
          ))}
        </div>
      </section>

      <div className="tabs mb-5" role="tablist">
        {TABS.map((t) => (
          <Link key={t.id} href={href(t.id)} role="tab" aria-selected={t.id === tab} className="tab">{t.label}</Link>
        ))}
      </div>

      {tab === "growth" && <Growth n={n} />}
      {tab === "tips" && <ModelTips n={n} />}
      {tab === "tipsters" && <Tipsters n={n} />}
    </>
  );
}

function Group({ title, series, cumulativeKeys = [], collapsible }: { title?: string; series: Series[]; cumulativeKeys?: string[]; collapsible?: boolean }) {
  const body = (
    <>
      <div className="grid gap-6 md:grid-cols-2">
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

async function ModelTips({ n }: { n: number }) {
  const series = await modelTipSeries(n);
  const units = series.find((s) => s.key === "units")!;
  return (
    <>
      <Group series={series} />
      <Group title="Units, running total" series={[units]} cumulativeKeys={["units"]} />
    </>
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
