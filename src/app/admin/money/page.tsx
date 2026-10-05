import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DayChart, DayTable } from "@/components/DayChart";
import type { MoneyReport } from "@/lib/money";
import { isAdmin, now } from "@/lib/admin";
import { adsReport, type AdsReport } from "@/lib/ads/report";
import { bank, type Bank as BankInfo } from "@/lib/bank";
import { invested, SINCE, type Invested } from "@/lib/invested";
import { RunningTotals } from "@/components/RunningTotals";
import { addCost, removeCost, stopCost } from "./actions";
import { Funnel, PeopleTile } from "./People";
import { planById, TERMS } from "@/lib/billing/plans";
import { priceBook, type PriceBook } from "@/lib/billing/prices";
import { getViewer } from "@/lib/auth";
import { moneyReport, upcomingCharges, type PlanFunnel, type UpcomingCharge } from "@/lib/money";

export const metadata: Metadata = { title: "Money", robots: { index: false } };

const WINDOWS = [7, 14, 30, 90] as const;
/** How far ahead Coming up looks, in days. */
const AHEAD = 7;
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
  // Stripe's charges are read once, far enough out for both Coming up and the rest of the month.
  const today = sydney(Math.floor(now() / 1000));
  const [y, m] = today.split("-").map(Number);
  const leftInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate() - Number(today.slice(8));
  const [r, prices, upcoming, ads, totals, cash] = await Promise.all([moneyReport(n), priceBook(), upcomingCharges(Math.max(AHEAD, leftInMonth + 1)), adsReport(n), invested(), bank()]);
  const t = r.totals;
  const weekOut = Math.floor(now() / 1000) + AHEAD * 86400;
  const soon = { ...upcoming, charges: upcoming.charges.filter((c) => c.at <= weekOut) };
  const monthCharges = upcoming.charges.filter((c) => sydney(c.at).startsWith(today.slice(0, 7)));

  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Money</h1>
          <p className="mt-1 text-sm text-ink-soft">This month, where the money is, and the last {n} days from a click to money in.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Window">
          {WINDOWS.map((d) => (
            <Link key={d} href={`/admin/money?days=${d}`} className={`btn btn-sm ${d === n ? "btn-primary" : "btn-secondary"}`}>{d} days</Link>
          ))}
        </div>
      </section>

      <PriceWarning prices={prices} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <PeopleTile n={money(r.mrr_cents)} label="monthly recurring" tone="bet" title={`Paying now, ${r.payingNow.length}`} people={r.payingNow} sum="A month's worth each: a yearly or quarterly bill spread over its months." />
        <PeopleTile n={money(t.revenue_cents)} label={`paid, ${n} days`} tone="prime" title={`Paid in the last ${n} days, ${r.paidPeople.length}`} people={r.paidPeople} sum={`${money(r.paidPeople.reduce((a, p) => a + (p.cents ?? 0), 0))} in all`} />
        <Tile n={r.signups.made} label="accounts made" />
        <Tile n={t.starts} label="trials and passes" />
        <Tile n={t.cancelled} label="cancelled" />
      </div>

      {/*
        Two stacks, each card at its own height, so a short card never leaves a hole beside a tall
        one (6 Oct 2026). On a phone, the left stack then the right.
      */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <ThisMonth m={totals.month} costs={totals.costs} feeShare={totals.revenue.gross ? totals.revenue.fees / totals.revenue.gross : 0} charges={monthCharges} conversion={upcoming.conversion} mrr={r.mrr_cents / 100} paying={r.payingNow.length} today={today} />
          <Totals t={totals} />
          <ComingUp {...soon} />
          <Fold title="By plan" className="min-w-0">
            <p className="text-xs text-ink-soft mb-3">Over the last {n} days: trials started, members who paid and what they paid. Active now is today.</p>
            <div className="overflow-x-auto">
              <table className="data-table stack-sm text-sm">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th className="text-right">Trials</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Active now</th>
                    <th className="text-right">Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {r.plans.map((p) => <Row key={p.id} p={p} />)}
                  <Row p={t} total />
                </tbody>
              </table>
            </div>
          </Fold>
        </div>
        <div className="flex flex-col gap-6 min-w-0">
          <Bank b={cash} />
          <Ads r={ads} n={n} />
          <Fold title="New accounts" className="min-w-0">
            <p className="text-xs text-ink-soft mb-3">Everyone who signed up in the last {n} days, and how far they got. Click a piece for who.</p>
            <Funnel people={r.signups.people} />
          </Fold>
          <Fold title="Trials">
            <p className="text-xs text-ink-soft mb-3">Subscriptions that began in the window.</p>
            <div className="panel-row"><span>Started</span><span className="nums font-bold">{r.trials.started}</span></div>
            <div className="panel-row"><span>Converted to paid</span><span className="nums font-bold">{r.trials.converted}</span></div>
            <div className="panel-row"><span>Still on trial</span><span className="nums font-bold">{r.trials.open}</span></div>
            <div className="panel-row"><span>Ended without paying</span><span className="nums font-bold">{r.trials.ended}</span></div>
            <div className="panel-row"><span>Conversion so far</span><span className="nums font-bold">{r.trials.started - r.trials.open ? rate(Math.round((r.trials.converted / (r.trials.started - r.trials.open)) * 1000) / 10) : "—"}</span></div>
          </Fold>
          <Fold title="Sign-ups by source">
            <p className="text-xs text-ink-soft mb-3">Where the window&apos;s new accounts came from, and what they have paid.</p>
            {r.sources.length === 0 && <p className="text-sm text-ink-soft">None in the window.</p>}
            {r.sources.map((s) => (
              <div key={s.source} className="panel-row">
                <span>{s.source}</span>
                <span className="nums text-ink-secondary">{s.signups} {s.signups === 1 ? "sign-up" : "sign-ups"}, {s.confirmed} confirmed, {s.paying} paying, {money(s.revenue_cents)}</span>
              </div>
            ))}
          </Fold>
        </div>
      </div>

      <Fold title="When" className="mb-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {r.byDay.map((s) => <DayChart key={s.key} s={s} />)}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-ink-soft">The numbers</summary>
          <div className="mt-2"><DayTable series={r.byDay} /></div>
        </details>
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
      </Fold>

      <Growth g={r.growth} />
    </>
  );
}

/** Stripe and the code disagree on a price, or a price is missing or archived: a red line at the top, nothing when all is well. */
function PriceWarning({ prices }: { prices: PriceBook }) {
  const wrong = [
    ...prices.plans.flatMap((p) => TERMS.map((t) => ({ name: `${p.name}, ${t.name.toLowerCase()}`, c: p.terms[t.id] }))),
    ...prices.passes.map((b) => ({ name: `${b.qty} day ${b.qty === 1 ? "pass" : "passes"}`, c: b.cell })),
  ].filter(({ c }) => c.dollars === undefined || !c.active || c.dollars !== c.expected);
  if (!wrong.length) return null;
  return (
    <div className="card border-red mb-6 text-sm">
      <strong className="text-red">Prices out of step with Stripe:</strong>{" "}
      {wrong.map(({ name, c }) => `${name} ${c.dollars === undefined ? "not in Stripe" : !c.active ? "archived" : `$${c.dollars}, code says $${c.expected}`}`).join(" · ")}
    </div>
  );
}

/**
 * The calendar month: what has come in after fees, what Stripe will still bill
 * before it ends (trials at the rate trials have paid), against the month's
 * costs with Meta carried out at this week's rate. Under it, the month as it
 * runs when nothing is lumpy: monthly recurring against a month's costs.
 */
function ThisMonth({ m, costs, feeShare, charges, conversion, mrr, paying, today }: {
  m: Invested["month"]; costs: Invested["costs"]; feeShare: number; charges: UpcomingCharge[];
  conversion?: { rate: number }; mrr: number; paying: number; today: string;
}) {
  const whole = (v: number) => `$${Math.round(v).toLocaleString("en-AU")}`;
  const sum = (xs: UpcomingCharge[]) => xs.reduce((a, c) => a + c.amount_cents, 0) / 100;
  const renewals = sum(charges.filter((c) => c.kind === "renewal"));
  const trials = sum(charges.filter((c) => c.kind === "first bill"));
  const trialsExpected = trials * (conversion?.rate ?? 0);
  const due = (renewals + trialsExpected) * (1 - feeShare);
  const fixed = m.fixed.reduce((a, c) => a + c.amount, 0);
  const ads = m.adsSoFar + m.adsPerDay * m.daysLeft;
  const end = m.inSoFar + due - fixed - ads;
  // A month when nothing is lumpy: running costs against monthly recurring.
  const running = costs.filter((c) => c.monthly && !c.stopped).reduce((a, c) => a + c.amount_cents / 100, 0) + m.adsPerDay * 30.4;
  const each = paying ? mrr / paying : 0;
  const name = dayLabel(`${m.month}-15`, { month: "long" });
  return (
    <Fold title={`This month, ${name}`} className="min-w-0">
      <p className="mt-1 text-xs text-ink-soft">After Stripe&apos;s fees. Trials count at the rate trials have paid so far; Meta runs to the month&apos;s end at this week&apos;s spend.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Mini n={whole(m.inSoFar)} label="in so far" tone="bet" />
        <Mini n={whole(due)} label="still due" sub={`renewals ${whole(renewals)} · trials ${whole(trialsExpected)} of ${whole(trials)}`} />
        <Mini n={whole(fixed + ads)} label="costs" sub={`fixed ${whole(fixed)} · ads ${whole(ads)}`} />
      </div>
      {/* One figure a line. The month can end ahead on yearly bills paid up front while the run rate is short, so the two are kept apart. */}
      <div className="mt-3 text-sm">
        <div className="panel-row">
          <span>{name} at the end, est.</span>
          <strong className={`nums ${end >= 0 ? "text-accent" : "text-red"}`}>{end >= 0 ? "+" : "−"}{whole(Math.abs(end))}</strong>
        </div>
        <div className="text-[11px] uppercase tracking-[0.08em] font-extrabold text-ink-soft mt-4 mb-1">Any month, at today&apos;s rate</div>
        <div className="panel-row"><span>Costs</span><span className="nums font-bold">{whole(running)}</span></div>
        <div className="panel-row"><span>Monthly recurring</span><span className="nums font-bold">{whole(mrr)}</span></div>
        <div className="panel-row">
          <span>Paying members to cover costs</span>
          <span className="nums font-bold">{each > 0 ? Math.ceil(running / each) : "—"} <span className="font-normal text-ink-soft">(have {paying})</span></span>
        </div>
      </div>
      {m.fixed.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer select-none text-xs font-semibold text-ink-soft">Costs in {name}</summary>
          {m.fixed.map((c, i) => (
            <div key={i} className={`panel-row text-xs ${c.date > today ? "text-ink-soft" : ""}`}>
              <span>{dayLabel(c.date, { day: "numeric", month: "short" })} · {c.what}{c.date > today ? " (to come)" : ""}</span>
              <span className="nums">${c.amount.toFixed(2)}</span>
            </div>
          ))}
          <div className="panel-row text-xs"><span>Meta so far, then {whole(m.adsPerDay)} a day</span><span className="nums">{whole(ads)}</span></div>
        </details>
      )}
    </Fold>
  );
}

/** Between a member paying and the bank: still clearing (and when), ready to pay out, and payouts on the way. */
function Bank({ b }: { b: BankInfo }) {
  const cents = (v: number) => `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const day = (iso: string) => dayLabel(iso, { weekday: "short", day: "numeric", month: "short" });
  // What lands with the next payout, all else equal: payouts already sent, what is ready now, and what clears by payout day.
  const sent = b.onTheWay.reduce((a, p) => a + p.amount, 0);
  const coming = sent + (b.nextPayout ? b.available + b.clearing.filter((c) => c.date <= b.nextPayout!).reduce((a, c) => a + c.amount, 0) : 0);
  return (
    <Fold title="Where the money is" className="min-w-0">
      <p className="mt-1 text-xs text-ink-soft">From Stripe, now. A payment takes {b.clearDays ?? "a few"} days to clear{b.schedule ? `, then goes out ${b.schedule}` : ""}.</p>
      {b.error ? <p className="mt-3 text-sm text-red">Stripe did not answer: {b.error}</p> : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Mini n={cents(b.pending)} label="clearing" />
            <Mini n={cents(b.available)} label="ready to pay out" tone="bet" />
            <Mini n={cents(coming)} label={b.nextPayout ? `bank, ${dayLabel(b.nextPayout, { weekday: "long" })}` : "on the way"} tone="prime" sub={b.nextPayout ? `payout ${day(b.nextPayout)}` : b.onTheWay[0] ? `lands ${day(b.onTheWay[0].arrives)}` : "nothing sent"} />
          </div>
          {b.clearing.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-[0.08em] font-extrabold text-ink-soft mb-1">Clears</div>
              {b.clearing.map((c) => <div key={c.date} className="panel-row text-xs"><span>{day(c.date)}</span><span className="nums">{cents(c.amount)}</span></div>)}
            </div>
          )}
          {b.onTheWay.length > 1 && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-[0.08em] font-extrabold text-ink-soft mb-1">Payouts on the way</div>
              {b.onTheWay.map((p, i) => <div key={i} className="panel-row text-xs"><span>Lands {day(p.arrives)}</span><span className="nums">{cents(p.amount)}</span></div>)}
            </div>
          )}
          {b.lastPaid && <p className="mt-3 text-xs text-ink-soft">Last payout {cents(b.lastPaid.amount)}, landed {day(b.lastPaid.arrived)}.</p>}
        </>
      )}
    </Fold>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

/** A section that folds to its heading: open on load, a click on the heading closes it. The named group keeps its arrow apart from folds inside it. */
function Fold({ title, className = "", summary, children }: { title: string; className?: string; summary?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details open className={`card group/fold min-w-0 ${className}`}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <h2 className="flex items-center gap-2 font-display font-extrabold">
          <span className="inline-block text-sm transition-transform group-open/fold:rotate-90" aria-hidden>▸</span>
          {title}
        </h2>
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

/** This week against last for one count, with the change. */
function Week({ label, w }: { label: string; w: [number, number] }) {
  const [now, before] = w;
  const pct = before ? Math.round(((now - before) / before) * 100) : undefined;
  const up = now > before, down = now < before;
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-ink-soft">{label}, last 7 days</span>
      <strong className="font-display text-xl tabular-nums">{now}</strong>
      <span className="text-ink-soft tabular-nums">vs {before} the week before</span>
      <span className={`font-semibold tabular-nums ${up ? "text-accent" : down ? "text-red" : "text-ink-soft"}`}>
        {up ? "▲" : down ? "▼" : "="} {pct === undefined ? (now ? "new" : "") : `${Math.abs(pct)}%`}
      </span>
    </div>
  );
}

/** Are we growing: new accounts and trial sign-ups a day, each with this week against last. */
function Growth({ g }: { g: MoneyReport["growth"] }) {
  return (
    <Fold title="Growth" className="mb-6" summary={
      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:gap-8">
        <Week label="Accounts" w={g.week.accounts} />
        <Week label="Trials" w={g.week.trials} />
      </div>
    }>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
        <DayChart s={g.accounts} />
        <DayChart s={g.trials} />
      </div>
    </Fold>
  );
}

function Row({ p, total }: { p: PlanFunnel; total?: boolean }) {
  const cls = total ? "font-bold bg-panel-alt" : "";
  const none = p.id === "passes";
  return (
    <tr className={cls}>
      <td>{p.name}{p.price ? <span className="text-ink-soft font-normal"> ${p.price}/mo</span> : null}</td>
      <td data-label="Trials" className="text-right nums">{none ? "—" : p.starts}</td>
      <td data-label="Paid" className="text-right nums">{p.paid}</td>
      <td data-label="Revenue" className="text-right nums">{money(p.revenue_cents)}</td>
      <td data-label="Active now" className="text-right nums">{none ? "—" : p.active}</td>
      <td data-label="Cancelled" className="text-right nums">{none ? "—" : p.cancelled}</td>
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
    <Fold title="Invested and revenue" className="min-w-0">
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
    </Fold>
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
    <Fold title="Meta ads" className="min-w-0">
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
    </Fold>
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

const sydney = (at: number) => new Date(at * 1000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { ...opts, timeZone: "Australia/Sydney" });
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-AU")}`;

/**
 * The next week's charges from Stripe: the sums first, then a day by
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
  const days = Array.from({ length: AHEAD }, (_, i) => {
    const iso = new Date(new Date(`${today}T12:00:00+10:00`).getTime() + i * 86400_000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    const on = charges.filter((c) => sydney(c.at) === iso);
    // Hover or tap a day for who is billed: "Gabriel Carr, Every day, yearly: $470 (trial ends)".
    const tip = on.map((c) => `${c.who}, ${c.plan}: ${dollars(c.amount_cents)}${c.kind === "first bill" ? " (trial ends)" : c.kind === "retry" ? " (retrying)" : ""}`).join("\n");
    return { iso, tip, trial: sum(on.filter((c) => c.kind === "first bill")), paying: sum(on.filter((c) => c.kind === "renewal")), retry: sum(on.filter((c) => c.kind === "retry")) };
  });
  const top = Math.max(1, ...days.map((d) => d.trial + d.paying + d.retry));

  return (
    <Fold title={`Coming up, next ${AHEAD} days`} className="min-w-0 flex flex-col">
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
            <div className="grid gap-1 flex-1" style={{ gridTemplateColumns: `repeat(${AHEAD}, minmax(0, 1fr))` }}>
              {days.map((d) => {
                const total = d.trial + d.paying + d.retry;
                return (
                  <div key={d.iso} className={`flex flex-col items-center h-full ${d.tip ? "cursor-help" : ""}`} data-tip={d.tip ? `${dayLabel(d.iso, { weekday: "long", day: "numeric", month: "short" })}, ${dollars(total)}\n${d.tip}` : undefined}>
                    {/* On a phone a day of $1,000 or more reads $1.2k: full figures crowd the row. */}
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
    </Fold>
  );
}
