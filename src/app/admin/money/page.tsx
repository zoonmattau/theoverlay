import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DayChart, DayTable } from "@/components/DayChart";
import { isAdmin, now } from "@/lib/admin";
import { adsReport, type AdsReport } from "@/lib/ads/report";
import { invested, SINCE, type Invested } from "@/lib/invested";
import { RunningTotals } from "@/components/RunningTotals";
import { addCost, removeCost, stopCost } from "./actions";
import { planById, TERMS, weekly } from "@/lib/billing/plans";
import { priceBook, type PriceCell } from "@/lib/billing/prices";
import { getViewer } from "@/lib/auth";
import { bookieName } from "@/lib/bookies";
import { moneyReport, upcomingCharges, type PlanFunnel, type UpcomingCharge } from "@/lib/money";

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
  const [r, prices, upcoming, ads, totals] = await Promise.all([moneyReport(n), priceBook(), upcomingCharges(14), adsReport(n), invested()]);
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

      {/* Side by side on a wide screen, stacked on a phone. */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6 items-start">
        <Totals t={totals} />
        <Ads r={ads} n={n} />
      </div>

      {/* Side by side on a wide screen, stacked on a phone: Coming up on the left, prices and new accounts down the right, both ending level. */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <ComingUp {...upcoming} />

      <div className="flex flex-col gap-6 min-w-0">
      <div className="card min-w-0">
        <h2 className="font-display font-extrabold">Plan prices</h2>
        <p className="mt-1 text-xs text-ink-soft mb-3">What Stripe charges now, per bill. The week figure is the bill spread over the weeks it covers.</p>
        {/* Half width on a wide screen: a column that does not fit scrolls inside the card. */}
        <div className="overflow-x-auto">
          <table className="data-table stack-sm text-xs">
            <thead><tr><th>Plan</th>{TERMS.map((t) => <th key={t.id} className="text-right whitespace-nowrap">{t.name}{t.off ? <span className="block font-normal normal-case">{Math.round(t.off * 100)}% off</span> : null}</th>)}</tr></thead>
            <tbody>
              {prices.plans.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold text-sm">{p.name}</td>
                  {TERMS.map((t) => <td key={t.id} data-label={t.name} className="text-right nums whitespace-nowrap"><Price c={p.terms[t.id]} months={t.months} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs nums">
          <span className="font-semibold">Day passes</span> <span className="text-ink-soft">any one date:</span>{" "}
          {prices.passes.map((b, i) => <span key={b.qty} className="whitespace-nowrap">{i ? " · " : ""}{b.qty} for <Price c={b.cell} /></span>)}
        </p>
      </div>

      {/* How far the window's new accounts got, each step's share of the one before; it takes up the rest of the column. */}
      <div className="card flex-1 flex flex-col">
        <h2 className="font-display font-extrabold">New accounts</h2>
        <p className="text-xs text-ink-soft mb-3">Everyone who signed up in the last {n} days, and how far they got.</p>
        <div className="flex-1 flex flex-col justify-center">
          <Funnel {...r.signups} />
        </div>
      </div>
      </div>
      </div>

      <div className="section mb-6">
        <div className="section-bar">
          <span className="section-letter">F</span>
          <h2>Funnel by plan</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table stack-sm text-sm">
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {r.byDay.map((s) => <DayChart key={s.key} s={s} />)}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-ink-soft">The numbers</summary>
          <div className="mt-2"><DayTable series={r.byDay} /></div>
        </details>
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
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
                  <td className={e.anonymous ? "text-ink-soft" : "font-semibold"}>{e.userId ? <Link href={`/admin/${e.userId}`} className="hover:text-blue">{e.who}</Link> : e.who}</td>
                  <td>{e.kind === "plan_click" ? "clicked the plan" : e.kind === "checkout_started" ? "opened checkout" : "finished checkout"}</td>
                  <td className="text-ink-secondary">{e.plan ? (planById(e.plan)?.name ?? e.plan) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 mb-6">
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
          // min-w-0 and nowrap: a label ("12pm") wider than its column would otherwise widen that column and its bar.
          <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={`${labels[i] || i}: ${v}`}>
            {v > 0 && <span className="nums text-[10px] text-ink-secondary whitespace-nowrap">{v}</span>}
            <div className="w-full rounded-sm bg-ink" style={{ height: `${Math.max(v ? 4 : 1, (v / max) * 80)}%`, opacity: v ? 1 : 0.15 }} />
            <span className="mt-1 text-[10px] text-ink-soft nums h-3 whitespace-nowrap">{labels[i]}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** One step of the account funnel: the count, and the share of the step before. */
/**
 * The window's sign-ups as one bar, each person in the furthest place they got:
 * never confirmed, confirmed with no plan, a plan that has ended, on a trial now, or paying.
 * Each piece is its share of everyone; hovering one gives the count.
 */
function Funnel({ made, confirmed, trials, trialling, paying }: { made: number; confirmed: number; trials: number; trialling: number; paying: number }) {
  if (made === 0) return <p className="text-sm text-ink-soft">No sign-ups in this window.</p>;
  // Left to right, red to green: how far each person got.
  const parts = [
    { n: Math.max(0, made - confirmed), label: "never confirmed their email", cls: "bg-red" },
    { n: Math.max(0, confirmed - trials), label: "confirmed, no plan", cls: "bg-amber" },
    { n: Math.max(0, trials - trialling - paying), label: "plan ended", cls: "bg-ink-soft" },
    { n: trialling, label: "on a trial now", cls: "bg-blue" },
    { n: paying, label: "paying now", cls: "bg-lime" },
  ];
  const pct = (n: number) => `${Math.round((n / made) * 100)}%`;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-display text-3xl font-extrabold nums">{made}</span>
        <span className="text-xs text-ink-soft">signed up</span>
      </div>
      <div className="flex h-8 w-full overflow-hidden rounded-md">
        {parts.filter((x) => x.n > 0).map((x) => (
          <div key={x.label} className={`${x.cls} h-full cursor-help border-r-2 border-panel last:border-r-0`} style={{ width: `${(x.n / made) * 100}%` }} data-tip={`${x.n} ${x.label}, ${pct(x.n)} of sign-ups`} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {parts.map((x) => (
          <li key={x.label} className="flex items-center gap-2 min-w-0">
            <span className={`${x.cls} h-2.5 w-2.5 shrink-0 rounded-sm`} />
            <span className="nums font-semibold">{x.n}</span>
            <span className="text-ink-soft truncate">{x.label}</span>
            <span className="nums text-ink-soft ml-auto">{pct(x.n)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ p, total }: { p: PlanFunnel; total?: boolean }) {
  const cls = total ? "font-bold bg-panel-alt" : "";
  return (
    <tr className={cls}>
      <td>{p.name}{p.price ? <span className="text-ink-soft font-normal"> ${p.price}/mo</span> : null}</td>
      <td data-label="Clicks" className="text-right nums">{p.clicks}</td>
      <td data-label="Checkouts" className="text-right nums">{p.checkouts}</td>
      <td data-label="Click to checkout" className="text-right nums text-ink-secondary">{rate(p.clickToCheckout)}</td>
      <td data-label="Trials" className="text-right nums">{p.starts}</td>
      <td data-label="Checkout to trial" className="text-right nums text-ink-secondary">{rate(p.checkoutToStart)}</td>
      <td data-label="Paid" className="text-right nums">{p.paid}</td>
      <td data-label="Trial to paid" className="text-right nums text-ink-secondary">{rate(p.startToPaid)}</td>
      <td data-label="Revenue" className="text-right nums">{money(p.revenue_cents)}</td>
      <td data-label="Active now" className="text-right nums">{p.id === "passes" ? "—" : p.active}</td>
      <td data-label="On trial" className="text-right nums">{p.id === "passes" ? "—" : p.trialling}</td>
      <td data-label="Cancelled" className="text-right nums">{p.id === "passes" ? "—" : p.cancelled}</td>
    </tr>
  );
}

/**
 * Everything in against everything out since the first day: revenue after
 * Stripe's fees, against Meta's spend and the costs typed in here. The cost
 * list sits under the chart, with a line to add one.
 */
function Totals({ t }: { t: Invested }) {
  const gap = t.revenue.net - t.invested.total;
  const whole = (v: number) => `$${Math.round(v).toLocaleString("en-AU")}`;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  return (
    <div className="card min-w-0">
      <h2 className="font-display font-extrabold">Invested and revenue</h2>
      <p className="mt-1 text-xs text-ink-soft">Since {dayLabel(SINCE, { day: "numeric", month: "short" })}. Revenue after Stripe&apos;s fees; invested is Meta plus the costs below.</p>
      {t.adsMissing && <p className="mt-1 text-xs text-amber">{t.adsMissing}</p>}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Mini n={whole(t.invested.total)} label="invested" sub={`ads ${whole(t.invested.ads)} · other ${whole(t.invested.other)}`} />
        <Mini n={whole(t.revenue.net)} label="revenue" sub={`${whole(t.revenue.fees)} fees`} tone="bet" />
        <Mini n={gap >= 0 ? `+${whole(gap)}` : `−${whole(-gap)}`} label={gap >= 0 ? "ahead" : "behind"} tone={gap >= 0 ? "prime" : undefined} />
      </div>
      <details className="mt-4 group">
        <summary className="cursor-pointer select-none text-sm font-semibold flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
          <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
          Running totals
        </summary>
        <div className="mt-3"><RunningTotals days={t.days} /></div>
      </details>

      <details className="mt-4 group">
        <summary className="cursor-pointer select-none text-sm font-semibold flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
          <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
          Costs other than Meta ({t.costs.length})
        </summary>
        <form action={addCost} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <label className="field"><span>Date</span><input type="date" name="date" defaultValue={today} required className="field-input" /></label>
          <label className="field"><span>Amount, $</span><input name="amount" inputMode="decimal" required placeholder="99.00" className="field-input w-28" /></label>
          <label className="field flex-1 min-w-40"><span>What</span><input name="what" required placeholder="Form King credits" className="field-input w-full" /></label>
          <label className="flex items-center gap-1.5 pb-2"><input type="checkbox" name="monthly" /> Monthly</label>
          <button type="submit" className="btn btn-primary btn-sm">Add</button>
        </form>
        {t.costs.length > 0 && (
          <table className="data-table stack-sm text-xs mt-3">
            <thead><tr><th>Date</th><th>What</th><th className="text-right">Amount</th><th></th></tr></thead>
            <tbody>
              {t.costs.map((c) => (
                <tr key={c.id}>
                  <td className="nums whitespace-nowrap">{dayLabel(c.date, { day: "numeric", month: "short" })}</td>
                  <td data-label="What">{c.what}{c.monthly ? <span className="text-ink-soft">{c.stopped ? `, monthly until ${dayLabel(c.stopped, { month: "short" })}` : ", monthly"}</span> : null}</td>
                  <td data-label="Amount" className="text-right nums">${(c.amount_cents / 100).toFixed(2)}</td>
                  <td className="text-right whitespace-nowrap">
                    {c.monthly && !c.stopped && (
                      <form action={stopCost} className="inline"><input type="hidden" name="id" value={c.id} /><button type="submit" className="text-ink-soft underline mr-3">Stop</button></form>
                    )}
                    <form action={removeCost} className="inline"><input type="hidden" name="id" value={c.id} /><button type="submit" className="text-ink-soft underline">Remove</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  );
}

/**
 * Meta's spend against what it brought over the window: cost per account,
 * per trial and per paying member, then the days. Paying lags a trial by its
 * length, so read cost per paying member over the window, not a day.
 */
function Ads({ r, n }: { r: AdsReport; n: number }) {
  const t = r.totals;
  const cost = (v?: number) => (v === undefined ? "–" : `$${v.toFixed(v >= 100 ? 0 : 2)}`);
  const days = [...r.days].reverse().filter((d) => d.spend || d.signups || d.trials || d.paid);
  return (
    <div className="card min-w-0">
      <h2 className="font-display font-extrabold">Meta ads</h2>
      <p className="mt-1 text-xs text-ink-soft">Last {n} days, against accounts from our own ad-link tags. A boost with no link counts as Instagram.</p>
      {r.missing && <p className="mt-1 text-xs text-amber">{r.missing}</p>}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <Mini n={`$${Math.round(t.spend).toLocaleString("en-AU")}`} label="spent" />
        <Mini n={cost(t.perSignup)} label="per account" sub={`${t.signups} accounts`} />
        <Mini n={cost(t.perTrial)} label="per trial" sub={`${t.trials} trials`} tone="prime" />
        <Mini n={t.backPerDollar !== undefined ? `$${t.backPerDollar.toFixed(2)}` : "–"} label="back per $1" sub={`$${Math.round(t.revenue)} in · ${t.paid} ${t.paid === 1 ? "member" : "members"}`} tone="bet" />
      </div>
      {r.byAd.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer select-none text-sm font-semibold flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
            By ad
          </summary>
          <p className="mt-1 text-xs text-ink-soft">Visits, accounts, trials and members (Mbr) from each ad&apos;s own link, what they paid (Rev, plans and passes), and dollars back per $1 spent.</p>
          <div className="overflow-x-auto -mx-1 px-1">
          {/* Tight: ten columns in half a page. Short headings, little padding, whole dollars where cents add nothing. */}
          <table className="data-table stack-sm text-[11px] mt-2 [&_th]:px-1 [&_td]:px-1 [&_th]:whitespace-nowrap">
            <thead><tr><th>Ad</th><th className="text-right">Spend</th><th className="text-right">Visits</th><th className="text-right">Accts</th><th className="text-right">Trials</th><th className="text-right">Mbr</th><th className="text-right">Rev</th><th className="text-right">/visit</th><th className="text-right">/trial</th><th className="text-right">$ back</th></tr></thead>
            <tbody>
              {r.byAd.map((a) => {
                const off = a.status && a.status !== "ACTIVE";
                const per = a.trials && a.spend ? a.spend / a.trials : undefined;
                const back = a.spend ? a.revenue / a.spend : undefined;
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
          </div>
        </details>
      )}
      {days.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer select-none text-sm font-semibold flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
            By day
          </summary>
          <table className="data-table stack-sm text-xs mt-3">
            <thead><tr><th>Day</th><th className="text-right">Spend</th><th className="text-right">Accounts</th><th className="text-right">Trials</th><th className="text-right">Paid</th><th className="text-right">Per trial</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td className="nums whitespace-nowrap">{dayLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td data-label="Spend" className="text-right nums">{d.spend ? `$${d.spend.toFixed(2)}` : ""}</td>
                  <td data-label="Accounts" className="text-right nums">{d.signups || ""}</td>
                  <td data-label="Trials" className="text-right nums">{d.trials || ""}</td>
                  <td data-label="Paid" className="text-right nums">{d.paid || ""}</td>
                  <td data-label="Per trial" className="text-right nums">{d.trials && d.spend ? `$${(d.spend / d.trials).toFixed(2)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

/** A small stat for the half-width cards: the figure, a label, and an optional line under it. */
function Mini({ n, label, sub, tone }: { n: string; label: string; sub?: string; tone?: "prime" | "bet" }) {
  const cls = tone === "prime" ? "border-lime bg-lime-soft" : tone === "bet" ? "border-blue bg-blue-soft" : "border-line";
  return (
    <div className={`rounded-md border px-2 py-1.5 text-center min-w-0 ${cls}`}>
      <div className="font-display text-lg font-extrabold tracking-tight nums leading-tight">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.06em] font-bold text-ink-soft">{label}</div>
      {sub && <div className="text-[10px] text-ink-soft nums truncate">{sub}</div>}
    </div>
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

/** One Stripe price: the dollars, the week figure for a plan, and a flag when it is missing or not what the code expects. */
function Price({ c, months }: { c: PriceCell; months?: number }) {
  if (c.dollars === undefined) return <span className="text-red">not in Stripe</span>;
  return (
    <>
      <strong>${c.dollars}</strong>
      {months ? <span className="block text-xs text-ink-soft">${weekly(c.dollars / months).toFixed(2)} a week</span> : null}
      {!c.active && <span className="block text-xs text-red">archived in Stripe</span>}
      {c.dollars !== c.expected && <span className="block text-xs text-red">code says ${c.expected}</span>}
    </>
  );
}

const sydney = (at: number) => new Date(at * 1000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { ...opts, timeZone: "Australia/Sydney" });
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-AU")}`;

/**
 * The next fortnight's charges from Stripe: the sums first, then a day by
 * day strip of when the money lands, then each charge. A trial's first bill
 * is money that may not come, so it is kept apart from a paying member's
 * renewal everywhere it shows.
 */
function ComingUp({ charges, conversion, error }: { charges: UpcomingCharge[]; conversion?: { ended: number; paid: number; rate: number }; error?: string }) {
  const trial = charges.filter((c) => c.kind === "first bill");
  // A failed card retrying is not a paying member: its own group, amber, everywhere it shows.
  const paying = charges.filter((c) => c.kind === "renewal");
  const retrying = charges.filter((c) => c.kind === "retry");
  const sum = (xs: UpcomingCharge[]) => xs.reduce((a, c) => a + c.amount_cents, 0);
  const today = sydney(Math.floor(now() / 1000));
  // Today on: a trial ends at 11pm, so a charge later today is still to come; one already tried is no longer due in Stripe.
  // Starting tomorrow left a yearly bill due at 11pm Saturday 3 Oct 2026 off the bars on the day itself.
  const days = Array.from({ length: 14 }, (_, i) => {
    const iso = new Date(new Date(`${today}T12:00:00+10:00`).getTime() + i * 86400_000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    const on = charges.filter((c) => sydney(c.at) === iso);
    // Hover or tap a day for who is billed: "Gabriel Carr, Every day, yearly: $470 (trial ends)".
    const tip = on.map((c) => `${c.who}, ${c.plan}: ${dollars(c.amount_cents)}${c.kind === "first bill" ? " (trial ends)" : c.kind === "retry" ? " (retrying)" : ""}`).join("\n");
    return { iso, tip, trial: sum(on.filter((c) => c.kind === "first bill")), paying: sum(on.filter((c) => c.kind === "renewal")), retry: sum(on.filter((c) => c.kind === "retry")) };
  });
  const top = Math.max(1, ...days.map((d) => d.trial + d.paying + d.retry));

  return (
    <div className="card min-w-0 flex flex-col">
      <h2 className="font-display font-extrabold">Coming up, next 14 days</h2>
      <p className="mt-1 text-xs text-ink-soft">From Stripe, at the amount it will bill. Plans booked to cancel are left out.</p>
      {error && <p className="mt-3 text-sm text-red">Stripe did not answer: {error}</p>}

      {!error && (
        <>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
            <div className="stat">
              <div className="stat-label">From paying members</div>
              <div className="font-display text-2xl font-extrabold nums mt-1">{dollars(sum(paying))}</div>
              <div className="text-xs text-ink-soft">{paying.length ? `${paying.length} ${paying.length === 1 ? "renewal" : "renewals"} due` : "Nothing due"}</div>
              {retrying.length > 0 && <div className="text-xs text-amber font-semibold">Plus {dollars(sum(retrying))} on {retrying.length} failed {retrying.length === 1 ? "card" : "cards"} retrying</div>}
            </div>
            {/* What the trials should bring at the rate trials have paid so far, not the most they could. */}
            <div className="stat border-lime bg-lime-soft">
              <div className="stat-label">Expected from trials</div>
              <div className="font-display text-2xl font-extrabold nums mt-1">{dollars(sum(trial) * (conversion?.rate ?? 0))}</div>
              <div className="text-xs text-ink-soft">
                {conversion?.ended ? `${Math.round(conversion.rate * 100)}% of trials pay (${conversion.paid} of ${conversion.ended} so far), of ${dollars(sum(trial))} from ${trial.length} ending` : `${trial.length} trials ending, no trial has finished yet`}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Most that can land</div>
              <div className="font-display text-2xl font-extrabold nums mt-1">{dollars(sum(charges))}</div>
              <div className="text-xs text-ink-soft">Trials can cancel before they are billed</div>
            </div>
          </div>

          {/* When it lands: a bar a day, renewals in blue, failed cards retrying in amber, trials in lime on top. */}
          <div className="mt-5 overflow-x-auto flex-1 flex flex-col">
            <div className="grid gap-1 min-w-[26rem] flex-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
              {days.map((d) => {
                const total = d.trial + d.paying + d.retry;
                return (
                  <div key={d.iso} className={`flex flex-col items-center h-full ${d.tip ? "cursor-help" : ""}`} data-tip={d.tip ? `${dayLabel(d.iso, { weekday: "long", day: "numeric", month: "short" })}, ${dollars(total)}\n${d.tip}` : undefined}>
                    {/* On a phone a day of $1,000 or more reads $1.2k: fourteen full figures crowd the row. */}
                    <div className="nums text-[10px] font-bold h-4 whitespace-nowrap">
                      {total >= 100_000 ? (
                        <>
                          <span className="sm:hidden">${(total / 100_000).toFixed(1)}k</span>
                          <span className="hidden sm:inline">{dollars(total)}</span>
                        </>
                      ) : total ? dollars(total) : ""}
                    </div>
                    <div className="w-full flex-1 min-h-24 flex flex-col justify-end rounded-sm bg-panel-alt">
                      {d.trial > 0 && <div className="w-full bg-lime rounded-t-sm" style={{ height: `${(d.trial / top) * 100}%` }} />}
                      {d.retry > 0 && <div className={`w-full bg-amber ${d.trial ? "" : "rounded-t-sm"}`} style={{ height: `${(d.retry / top) * 100}%` }} />}
                      {d.paying > 0 && <div className="w-full bg-blue" style={{ height: `${(d.paying / top) * 100}%` }} />}
                    </div>
                    <div className="text-[10px] text-ink-soft mt-1 leading-tight text-center">
                      {d.iso === today ? "Today" : dayLabel(d.iso, { weekday: "short" })}
                      <br />
                      {dayLabel(d.iso, { day: "numeric" })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-ink-soft">
              <span><i className="legend-dot bg-lime" /> Trial ending</span>
              <span><i className="legend-dot bg-blue" /> Paying member</span>
              <span><i className="legend-dot bg-amber" /> Failed card, retrying</span>
            </div>
          </div>

          {charges.length > 0 && (
            <details className="mt-4 group">
              <summary className="cursor-pointer select-none text-sm font-semibold flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
                Every charge ({charges.length})
              </summary>
            <table className="data-table stack-sm text-xs mt-3">
              <thead><tr><th>Date</th><th>Member</th><th>Plan</th><th>Bill</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {charges.map((c, i) => (
                  <tr key={i}>
                    <td className="nums whitespace-nowrap">{dayLabel(sydney(c.at), { weekday: "short", day: "numeric", month: "short" })}</td>
                    <td data-label="Member">{c.userId ? <Link href={`/admin/${c.userId}`} className="hover:text-blue">{c.who}</Link> : c.who}</td>
                    <td data-label="Plan" className="text-ink-secondary">{c.plan}</td>
                    <td data-label="Bill" className={"whitespace-nowrap " + (c.kind === "first bill" ? "text-accent font-semibold" : c.kind === "retry" ? "text-amber font-semibold" : "")}>{c.kind === "first bill" ? "Trial ends" : c.kind === "retry" ? "Retrying" : "Renewal"}</td>
                    <td data-label="Amount" className="text-right nums font-bold">{dollars(c.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </details>
          )}
        </>
      )}
    </div>
  );
}
