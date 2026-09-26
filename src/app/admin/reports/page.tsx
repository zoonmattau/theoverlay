import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DayChart, DayTable } from "@/components/DayChart";
import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { growthSeries, modelHealth, modelTipSeries, tipsterTipSeries, type HealthDay, type Series } from "@/lib/reports";
import { recordStats, type RecordStats } from "@/lib/tips";
import { racingToday } from "@/lib/model/source";

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

/** The model against the results: calibration on the favourite and on its own pick, and the record at settled prices. */
async function Health({ n }: { n: number }) {
  const { days, total } = await modelHealth(n);
  if (days.length === 0) return null;
  const u = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "—");
  const Row = ({ d, strong }: { d: HealthDay; strong?: boolean }) => (
    <tr className={strong ? "font-semibold" : ""}>
      <td className="whitespace-nowrap">{d.date === "total" ? `${days.length} days` : d.date.slice(5)}</td>
      <td data-label="Races" className="text-right nums">{d.races}</td>
      <td data-label="Fav won / said" className="text-right nums">{d.favWon} <span className="text-ink-soft">/ {d.favSaid.toFixed(1)}</span></td>
      <td data-label="Fav 4th+" className="text-right nums">{pct(d.favLow, d.races)}</td>
      <td data-label="Top pick won / said" className="text-right nums">{d.topWon} <span className="text-ink-soft">/ {d.topSaid.toFixed(1)}</span></td>
      <td data-label="Top pick %" className="text-right nums">{pct(d.topWon, d.races)}</td>
      <td data-label="Bets" className={`text-right nums ${d.betUnits > 0 ? "text-accent" : d.betUnits < 0 ? "text-red" : ""}`}>{d.bets} <span className="text-ink-soft">{u(d.betUnits)}u</span></td>
      <td data-label="Lays" className={`text-right nums ${d.layUnits > 0 ? "text-accent" : d.layUnits < 0 ? "text-red" : ""}`}>{d.lays} <span className="text-ink-soft">{u(d.layUnits)}u</span></td>
    </tr>
  );
  return (
    <div className="card mb-4">
      <h2 className="font-display font-extrabold mb-1">The model against the results</h2>
      <p className="text-xs text-ink-soft mb-3">Won / form said: winners against the winners the form's own prices added up to, on the market favourite and on the form's top pick. A form that is right says as many as win. Fav 4th+ is how often the favourite sat outside the form's top three. Units settle at the price the call was struck at.</p>
      <div className="overflow-x-auto">
        <table className="data-table stack-sm text-sm">
          <thead><tr><th>Day</th><th className="text-right">Races</th><th className="text-right">Fav won / said</th><th className="text-right">Fav 4th+</th><th className="text-right">Top pick won / said</th><th className="text-right">Top pick %</th><th className="text-right">Bets</th><th className="text-right">Lays</th></tr></thead>
          <tbody>
            <Row d={total} strong />
            {days.map((d) => <Row key={d.date} d={d} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function ModelTips({ n }: { n: number }) {
  const [series, record] = await Promise.all([modelTipSeries(n), recordStats(racingToday())]);
  const units = series.find((s) => s.key === "units")!;
  return (
    <>
      <Health n={n} />
      <Group series={series} />
      <Group title="Units, running total" series={[units]} cumulativeKeys={["units"]} />
      <Pot record={record} />
    </>
  );
}

const pot = (units: number, staked: number) => (staked ? `${units > 0 ? "+" : units < 0 ? "−" : ""}${Math.abs((units / staked) * 100).toFixed(1)}%` : "—");
const signed = (u: number) => `${u > 0 ? "+" : u < 0 ? "−" : ""}${Math.abs(u).toFixed(2)}u`;

/** Profit on turnover: units won over units staked, bets, lays and the two together, by period. */
function Pot({ record }: { record: RecordStats[] }) {
  const rows = record.filter((r) => r.period !== "year");
  const label: Record<string, string> = { week: "Last week", month: "Last month", all: "All time" };
  const tone = (u: number) => (u > 0 ? "text-accent" : u < 0 ? "text-red" : "");
  return (
    <div className="card mb-4">
      <h2 className="font-display font-extrabold mb-1">Profit on turnover</h2>
      <p className="text-xs text-ink-soft mb-3">Units won over units staked. A bet stakes one unit, a tenth on a Way Overlay; a lay stakes the unit it wins.</p>
      <table className="data-table stack-sm text-sm">
        <thead><tr><th>Period</th><th className="text-right">Bets</th><th className="text-right">Bets POT</th><th className="text-right">Lays</th><th className="text-right">Lays POT</th><th className="text-right">Overall</th><th className="text-right">Overall POT</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const u = r.bets.units + r.lays.units;
            const st = r.bets.staked + r.lays.staked;
            return (
              <tr key={r.period}>
                <td className="font-semibold">{label[r.period] ?? r.period}</td>
                <td data-label="Bets" className={`text-right nums ${tone(r.bets.units)}`}>{r.bets.n} · {signed(r.bets.units)}</td>
                <td data-label="Bets POT" className={`text-right nums font-semibold ${tone(r.bets.units)}`}>{pot(r.bets.units, r.bets.staked)}</td>
                <td data-label="Lays" className={`text-right nums ${tone(r.lays.units)}`}>{r.lays.n} · {signed(r.lays.units)}</td>
                <td data-label="Lays POT" className={`text-right nums font-semibold ${tone(r.lays.units)}`}>{pot(r.lays.units, r.lays.staked)}</td>
                <td data-label="Overall" className={`text-right nums ${tone(u)}`}>{r.bets.n + r.lays.n} · {signed(u)}</td>
                <td data-label="Overall POT" className={`text-right nums font-bold ${tone(u)}`}>{pot(u, st)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
