import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DayChart, DayTable } from "@/components/DayChart";
import { isAdmin } from "@/lib/admin";
import { planById } from "@/lib/billing/plans";
import { getViewer } from "@/lib/auth";
import { bookieName } from "@/lib/bookies";
import { moneyReport, type PlanFunnel } from "@/lib/money";

export const metadata: Metadata = { title: "Money", robots: { index: false } };

const WINDOWS = [7, 14, 30, 90] as const;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const rate = (n: number) => `${n}%`;

export default function Page({ searchParams }: PageProps<"/admin/money">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Money searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Money({ searchParams }: { searchParams: PageProps<"/admin/money">["searchParams"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const sp = await searchParams;
  const n = WINDOWS.includes(Number(sp.days) as (typeof WINDOWS)[number]) ? Number(sp.days) : 30;
  const r = await moneyReport(n);
  const t = r.totals;

  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Money</h1>
          <p className="mt-1 text-sm text-ink-soft">From a click on a plan to money in, by plan, over the last {n} days.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Window">
          {WINDOWS.map((d) => (
            <Link key={d} href={`/admin/money?days=${d}`} className={`btn btn-sm ${d === n ? "btn-primary" : "btn-secondary"}`}>{d} days</Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        <Tile n={money(r.mrr_cents)} label="monthly recurring" tone="bet" />
        <Tile n={money(t.revenue_cents)} label={`paid, ${n} days`} tone="bet" />
        <Tile n={r.signups.made} label="accounts made" />
        <Tile n={r.signups.confirmed} label="confirmed email" />
        <Tile n={t.clicks} label="plan clicks" />
        <Tile n={t.starts} label="trials and passes" />
        <Tile n={t.paid} label="paid" tone="prime" />
        <Tile n={t.cancelled} label="cancelled" />
      </div>

      <div className="card mb-6">
        <h2 className="font-display font-extrabold">New accounts</h2>
        <p className="text-xs text-ink-soft mb-3">Everyone who signed up in the window, and how far they got.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
          <Step n={r.signups.made} label="signed up" />
          <Step n={r.signups.confirmed} label="confirmed email" of={r.signups.made} />
          <Step n={r.signups.trials} label="started a plan" of={r.signups.confirmed} />
          <Step n={r.signups.paying} label="paying now" of={r.signups.trials} />
        </div>
      </div>

      <div className="section mb-6">
        <div className="section-bar">
          <span className="section-letter">F</span>
          <h2>Funnel by plan</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table text-sm">
            <thead>
              <tr>
                <th>Plan</th>
                <th className="text-right">Clicks</th>
                <th className="text-right">Checkouts</th>
                <th className="text-right">Click to checkout</th>
                <th className="text-right">Trials</th>
                <th className="text-right">Checkout to trial</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Trial to paid</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Active now</th>
                <th className="text-right">On trial</th>
                <th className="text-right">Cancelled</th>
              </tr>
            </thead>
            <tbody>
              {r.plans.map((p) => <Row key={p.id} p={p} />)}
              <Row p={t} total />
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-ink-soft">
          Clicks are presses on a plan button. Checkouts are Stripe sessions opened. Trials are subscriptions that started, or passes bought. Paid is members who made a payment in the window. Rates are between neighbouring steps.
        </p>
      </div>

      <div className="card mb-6">
        <h2 className="font-display font-extrabold mb-3">When</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {r.byDay.map((s) => <DayChart key={s.key} s={s} />)}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-ink-soft">The numbers</summary>
          <div className="mt-2"><DayTable series={r.byDay} /></div>
        </details>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Bars title="Plan clicks by hour, Sydney time" values={r.byHour} labels={r.byHour.map((_, h) => (h % 3 === 0 ? `${h % 12 || 12}${h < 12 ? "am" : "pm"}` : ""))} />
          <Bars title="Plan clicks by weekday" values={r.byWeekday} labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} />
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-ink-soft">Last {r.recent.length} clicks and checkouts</summary>
          <table className="data-table text-xs mt-2">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Plan</th></tr></thead>
            <tbody>
              {r.recent.map((e, i) => (
                <tr key={i}>
                  <td className="nums whitespace-nowrap">{when(e.at)}</td>
                  <td className={e.anonymous ? "text-ink-soft" : "font-semibold"}>{e.who}</td>
                  <td>{e.kind === "plan_click" ? "clicked the plan" : e.kind === "checkout_started" ? "opened checkout" : "finished checkout"}</td>
                  <td className="text-ink-secondary">{e.plan ? (planById(e.plan)?.name ?? e.plan) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <div className="card">
          <h2 className="font-display font-extrabold">Trials</h2>
          <p className="text-xs text-ink-soft mb-3">Subscriptions that began in the window.</p>
          <div className="panel-row"><span>Started</span><span className="nums font-bold">{r.trials.started}</span></div>
          <div className="panel-row"><span>Converted to paid</span><span className="nums font-bold">{r.trials.converted}</span></div>
          <div className="panel-row"><span>Still on trial</span><span className="nums font-bold">{r.trials.open}</span></div>
          <div className="panel-row"><span>Ended without paying</span><span className="nums font-bold">{r.trials.ended}</span></div>
          <div className="panel-row"><span>Conversion so far</span><span className="nums font-bold">{r.trials.started - r.trials.open ? rate(Math.round((r.trials.converted / (r.trials.started - r.trials.open)) * 1000) / 10) : "—"}</span></div>
        </div>
        <div className="card">
          <h2 className="font-display font-extrabold">Sign-ups by source</h2>
          <p className="text-xs text-ink-soft mb-3">Where the window&apos;s new accounts came from, and what they have paid.</p>
          {r.sources.length === 0 && <p className="text-sm text-ink-soft">None in the window.</p>}
          {r.sources.map((s) => (
            <div key={s.source} className="panel-row">
              <span>{s.source}</span>
              <span className="nums text-ink-secondary">{s.signups} {s.signups === 1 ? "sign-up" : "sign-ups"}, {s.confirmed} confirmed, {s.paying} paying, {money(s.revenue_cents)}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 className="font-display font-extrabold">Bookie clicks</h2>
          <p className="text-xs text-ink-soft mb-3">Prices followed out to a bookie.</p>
          {r.bookies.length === 0 && <p className="text-sm text-ink-soft">None in the window.</p>}
          {r.bookies.map((b) => (
            <div key={b.bookie} className="panel-row">
              <span>{bookieName(b.bookie) || b.bookie}</span>
              <span className="nums font-bold">{b.clicks}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

/** A row of bars for hours or weekdays, the count above any bar that has one. */
function Bars({ title, values, labels }: { title: string; values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <figure className="m-0">
      <figcaption className="text-[11px] uppercase tracking-[0.08em] font-extrabold text-ink-soft mb-2">{title}</figcaption>
      <div className="flex items-end gap-1 h-28">
        {values.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${labels[i] || i}: ${v}`}>
            {v > 0 && <span className="nums text-[10px] text-ink-secondary">{v}</span>}
            <div className="w-full rounded-sm bg-ink" style={{ height: `${Math.max(v ? 4 : 1, (v / max) * 80)}%`, opacity: v ? 1 : 0.15 }} />
            <span className="mt-1 text-[10px] text-ink-soft nums h-3">{labels[i]}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** One step of the account funnel: the count, and the share of the step before. */
function Step({ n, label, of }: { n: number; label: string; of?: number }) {
  return (
    <div className="rounded-md bg-panel-alt py-3">
      <div className="font-display text-2xl font-extrabold nums">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-soft font-bold">{label}</div>
      {of !== undefined && <div className="nums text-xs text-ink-secondary mt-0.5">{of ? `${Math.round((n / of) * 100)}% of the step before` : "—"}</div>}
    </div>
  );
}

function Row({ p, total }: { p: PlanFunnel; total?: boolean }) {
  const cls = total ? "font-bold bg-panel-alt" : "";
  return (
    <tr className={cls}>
      <td>{p.name}{p.price ? <span className="text-ink-soft font-normal"> ${p.price}/mo</span> : null}</td>
      <td className="text-right nums">{p.clicks}</td>
      <td className="text-right nums">{p.checkouts}</td>
      <td className="text-right nums text-ink-secondary">{rate(p.clickToCheckout)}</td>
      <td className="text-right nums">{p.starts}</td>
      <td className="text-right nums text-ink-secondary">{rate(p.checkoutToStart)}</td>
      <td className="text-right nums">{p.paid}</td>
      <td className="text-right nums text-ink-secondary">{rate(p.startToPaid)}</td>
      <td className="text-right nums">{money(p.revenue_cents)}</td>
      <td className="text-right nums">{p.id === "passes" ? "—" : p.active}</td>
      <td className="text-right nums">{p.id === "passes" ? "—" : p.trialling}</td>
      <td className="text-right nums">{p.id === "passes" ? "—" : p.cancelled}</td>
    </tr>
  );
}

function Tile({ n, label, tone }: { n: number | string; label: string; tone?: "prime" | "bet" }) {
  const cls = tone === "prime" ? "border-lime bg-lime-soft" : tone === "bet" ? "border-blue bg-blue-soft" : "";
  return (
    <div className={`card text-center ${cls}`}>
      <div className="font-display text-2xl font-extrabold tracking-tight nums">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{label}</div>
    </div>
  );
}
