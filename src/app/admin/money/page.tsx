import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin } from "@/lib/admin";
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

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Tile n={money(r.mrr_cents)} label="monthly recurring" tone="bet" />
        <Tile n={money(t.revenue_cents)} label={`paid, ${n} days`} tone="bet" />
        <Tile n={t.clicks} label="plan clicks" />
        <Tile n={t.starts} label="trials and passes" />
        <Tile n={t.paid} label="paid" tone="prime" />
        <Tile n={t.cancelled} label="cancelled" />
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
              <span className="nums text-ink-secondary">{s.signups} {s.signups === 1 ? "sign-up" : "sign-ups"}, {s.paying} paying, {money(s.revenue_cents)}</span>
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
