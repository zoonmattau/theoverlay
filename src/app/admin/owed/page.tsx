import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { markPaid } from "@/app/admin/affiliates/actions";
import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { owedReport } from "@/lib/owed";

export const metadata: Metadata = { title: "Owed", robots: { index: false } };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
const monthName = (m: string) => new Date(`${m}-15T12:00:00+10:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "Australia/Sydney" });

export default function Page() {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Owed />
      </Suspense>
    </div>
  );
}

/**
 * Who we owe, why and how much: commission per affiliate, payment by payment,
 * for each month not yet paid, with Mark paid on the month; then the monthly
 * bills and when each next falls due.
 */
async function Owed() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const r = await owedReport();
  const owing = r.affiliates.filter((a) => a.owed_cents > 0);
  const billsMonth = r.bills.reduce((s, b) => s + b.amount_cents, 0);
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Owed</h1>
      <p className="mt-1 text-sm text-ink-soft">Commission each affiliate has earned on what their members paid, payment by payment, and the monthly bills coming up.</p>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="stat border-lime bg-lime-soft"><div className="font-display text-2xl font-extrabold nums">{money(r.owed_cents)}</div><div className="stat-label">commission owed</div></div>
        <div className="stat"><div className="font-display text-2xl font-extrabold nums">{owing.length}</div><div className="stat-label">{owing.length === 1 ? "affiliate to pay" : "affiliates to pay"}</div></div>
        <div className="stat"><div className="font-display text-2xl font-extrabold nums">{money(billsMonth)}</div><div className="stat-label">monthly bills</div></div>
      </div>

      <h2 className="mt-8 font-display text-lg font-extrabold">Affiliates</h2>
      {owing.length === 0 && <p className="mt-2 text-sm text-ink-soft">Nothing owed: every month with commission is marked paid.</p>}
      {owing.map((a) => (
        <div key={a.affiliate.id} className="card mt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <Link href="/admin/affiliates" className="font-display font-extrabold text-lg hover:text-blue">{a.affiliate.name}</Link>
              <span className="ml-2 text-xs text-ink-soft">{a.affiliate.code} · {Number(a.affiliate.commission_pct)}% of what their members pay{a.affiliate.email ? ` · ${a.affiliate.email}` : ""}</span>
            </div>
            <div className="text-right">
              <div className="font-display text-xl font-extrabold nums">{money(a.owed_cents)}</div>
              <div className="text-[11px] text-ink-soft">{a.lastPaid ? `last paid ${money(a.lastPaid.cents)} on ${day(a.lastPaid.at)}` : "never paid yet"}</div>
            </div>
          </div>
          {a.unpaid.map((m) => (
            <div key={m.month} className="mt-3 border-t border-line pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">{monthName(m.month)}: <span className="nums">{money(m.commission_cents)}</span> <span className="font-normal text-ink-soft">from {m.lines.length} {m.lines.length === 1 ? "payment" : "payments"}</span></div>
                <form action={markPaid.bind(null, a.affiliate.id, m.month)} className="flex items-center gap-2">
                  <input name="amount" type="number" step="0.01" min={0} defaultValue={(m.commission_cents / 100).toFixed(2)} className="field-input w-24 py-1 text-xs" aria-label="Amount paid" />
                  <input name="note" placeholder="Reference" className="field-input w-28 py-1 text-xs" aria-label="Reference" />
                  <button className="btn btn-primary btn-sm" type="submit">Mark paid</button>
                </form>
              </div>
              <table className="data-table stack-sm text-xs mt-2">
                <thead><tr><th>Paid on</th><th>Member</th><th>For</th><th className="text-right">They paid</th><th className="text-right">Commission</th></tr></thead>
                <tbody>
                  {m.lines.map((l, i) => (
                    <tr key={i}>
                      <td data-label="Paid on" className="nums whitespace-nowrap">{day(l.date)}</td>
                      <td data-label="Member"><Link href={`/admin/${l.memberId}`} className="hover:text-blue">{l.who}</Link></td>
                      <td data-label="For">{l.what}</td>
                      <td data-label="They paid" className="text-right nums">{money(l.amount_cents)}</td>
                      <td data-label="Commission" className="text-right nums font-semibold">{money(l.commission_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}

      <h2 className="mt-8 font-display text-lg font-extrabold">Monthly bills</h2>
      {r.bills.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">No monthly bills entered. Add them as monthly costs on the Money page.</p>
      ) : (
        <table className="data-table stack-sm text-sm mt-2">
          <thead><tr><th>Next due</th><th>What</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {r.bills.map((b, i) => (
              <tr key={i}>
                <td data-label="Next due" className="nums whitespace-nowrap">{day(b.next)}</td>
                <td data-label="What">{b.what}</td>
                <td data-label="Amount" className="text-right nums">{money(b.amount_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-ink-soft">From the monthly costs on the <Link href="/admin/money" className="underline">Money</Link> page, each due on the same day of the month it started.</p>
    </>
  );
}
