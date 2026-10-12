import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { createAffiliate, deleteAffiliate, markPaid, toggleAffiliate, toggleListed, updateAffiliate } from "@/app/admin/affiliates/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyLink } from "@/components/CopyLink";
import { isAdmin } from "@/lib/admin";
import { affiliateStats, type AffiliateMember, type AffiliateStats } from "@/lib/affiliates";
import { getViewer } from "@/lib/auth";
import { planById } from "@/lib/billing/plans";
import { owedReport, type OwedMonth } from "@/lib/owed";

export const metadata: Metadata = { title: "Tipsters and affiliates", robots: { index: false } };

export default function Page() {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Affiliates />
      </Suspense>
    </div>
  );
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const dayOf = (ymd: string) => new Date(`${ymd}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
const TERM: Record<string, string> = { week: "weekly", month: "monthly", quarter: "quarterly", year: "yearly" };

/**
 * Tipsters and affiliates as a table (the user, 12 Oct 2026): what a partner
 * is worth and what you owe them. One row each: paying people, what they
 * brought in, their cut, and the money (owe, paid or a dash), owed first. A
 * row opens to pay a month, their people, the link counts and settings.
 */
async function Affiliates() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const [rows, owed] = await Promise.all([affiliateStats(), owedReport()]);
  const unpaidOf = new Map(owed.affiliates.map((o) => [o.affiliate.id, o.unpaid]));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
  const owe = (a: AffiliateStats) => Math.max(0, a.commission_cents - a.paid_cents);
  const totalOwe = rows.reduce((s, a) => s + owe(a), 0);

  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Tipsters and affiliates</h1>
        {totalOwe > 0 ? (
          <Link href="/admin/owed" className="badge badge-lay text-sm">Owe {money(totalOwe)} · pay</Link>
        ) : (
          <span className="badge badge-prime text-sm">All paid</span>
        )}
      </section>

      {rows.length === 0 ? <p className="text-sm text-ink-soft">No partners yet.</p> : (
        <div className="card p-0 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_6rem_6rem_6rem_7rem] gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft border-b border-line">
            <span>Partner</span><span className="text-right">Paying</span><span className="text-right">Brought in</span><span className="text-right">Their cut</span><span className="text-right">Money</span>
          </div>
          {/* Whoever is owed first, then by what they bring in. */}
          {[...rows].sort((x, y) => owe(y) - owe(x) || y.revenue_cents - x.revenue_cents).map((a) => <Partner key={a.id} a={a} owe={owe(a)} unpaid={unpaidOf.get(a.id) ?? []} site={site} />)}
        </div>
      )}

      <details className="card mt-6">
        <summary className="cursor-pointer font-display font-extrabold">Add a partner</summary>
        <form action={createAffiliate} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="field"><span>Name</span><input name="name" required className="field-input w-48" placeholder="Punters Podcast" /></label>
          <label className="field"><span>Code</span><input name="code" className="field-input w-36" placeholder="PODCAST" /></label>
          <label className="field"><span>Email</span><input name="email" type="email" required className="field-input w-56" placeholder="the email they log in with" /></label>
          <label className="field"><span>Commission %</span><input name="pct" type="number" min={0} max={100} defaultValue={40} className="field-input w-24" /></label>
          <button className="btn btn-primary btn-sm" type="submit">Add</button>
        </form>
      </details>
    </>
  );
}

function Partner({ a, owe, unpaid, site }: { a: AffiliateStats; owe: number; unpaid: OwedMonth[]; site: string }) {
  const userId = (a as { user_id?: string | null }).user_id;
  return (
    <details className={`group border-b border-line last:border-b-0 ${a.active ? "" : "opacity-60"}`}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_6rem_6rem_6rem_7rem] items-center gap-x-2 gap-y-1 px-4 py-3 hover:bg-panel-alt">
        <span className="font-semibold">
          <span className="inline-block w-4 text-ink-soft transition-transform group-open:rotate-90" aria-hidden>▸</span>
          {a.name} <span className="text-xs text-ink-soft nums">{a.code}</span>
          {!a.active && <span className="badge badge-warn ml-1">Off</span>}
          {userId && !a.listed && <span className="badge badge-warn ml-1">Hidden</span>}
        </span>
        <span className="hidden sm:block text-right nums">{a.paying}{a.trials ? <span className="text-xs text-ink-soft"> +{a.trials} trial</span> : null}</span>
        <span className="hidden sm:block text-right nums">{money(a.revenue_cents)}</span>
        <span className="hidden sm:block text-right nums text-ink-secondary">{money(a.commission_cents)}</span>
        <span className="text-right nums">
          {owe > 0 ? <span className="badge badge-lay">Owe {money(owe)}</span> : a.paid_cents > 0 ? <span className="badge badge-prime">Paid</span> : <span className="text-ink-soft">–</span>}
        </span>
        {/* On a phone the three counts sit under the name. */}
        <span className="sm:hidden col-span-2 text-xs text-ink-soft nums">{a.paying} paying{a.trials ? ` +${a.trials} trial` : ""} · {money(a.revenue_cents)} in · {money(a.commission_cents)} theirs</span>
      </summary>
      <div className="px-4 pb-4 space-y-3 bg-panel-alt/40">
        {unpaid.length > 0 && (
          <Block title="Pay them">
            {/* What it is for: each payment their people made, and their cut of it. Kept by calendar month
                behind the scenes, so a month of payments is paid in one go. */}
            {unpaid.map((m) => (
              <div key={m.month} className="space-y-1">
                {m.lines.map((l, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-semibold">{l.who}</span>
                    <span className="text-xs text-ink-soft">{l.what} · paid {money(l.amount_cents)} on {dayOf(l.date)}</span>
                    <span className="ml-auto nums font-semibold">{money(l.commission_cents)}</span>
                  </div>
                ))}
                <form action={markPaid.bind(null, a.id, m.month)} className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <span className="text-ink-soft text-xs">$</span>
                  <input name="amount" type="number" step="0.01" min={0} defaultValue={(m.commission_cents / 100).toFixed(2)} className="field-input w-24 py-1 text-xs" aria-label="Amount paid" />
                  <input name="note" placeholder="Reference (optional)" className="field-input w-40 py-1 text-xs" aria-label="Reference" />
                  <button className="btn btn-primary btn-sm" type="submit">Mark paid</button>
                </form>
              </div>
            ))}
          </Block>
        )}

        <Block title={`Their people (${a.members.length})`}>
          {a.members.length === 0 ? <p className="text-xs text-ink-soft">Nobody yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase tracking-[0.08em] text-ink-soft"><th className="text-left font-bold pb-1">Name</th><th className="text-left font-bold pb-1">Plan</th><th className="text-right font-bold pb-1">Status</th></tr></thead>
              <tbody>
                {a.members.map((m) => (
                  <tr key={m.id} className="border-t border-line-soft">
                    <td className="py-1.5 pr-2"><Link href={`/admin/${m.id}`} className="hover:text-blue">{m.name ?? m.email ?? "a member"}</Link></td>
                    <td className="py-1.5 pr-2 text-xs text-ink-secondary">{planText(m) || "–"}</td>
                    <td className="py-1.5 text-right"><span className={`badge ${STATUS[m.status]?.badge ?? "badge-muted"}`}>{STATUS[m.status]?.label ?? m.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Block>

        <Block title="Their link">
          <p className="text-sm nums">{a.clicks} clicks · {a.signups} signed up · they get {Number(a.commission_pct)}%</p>
          <div className="mt-2"><CopyLink link={`${site}/go/${a.code}`} /></div>
        </Block>

        <Block title="Settings">
          <div className="flex flex-wrap gap-2">
            {userId && <Link href={`/t/${a.code}`} className="btn btn-secondary btn-sm">Their tips page</Link>}
            {userId && <Link href={`/admin/${userId}`} className="btn btn-secondary btn-sm">Their account</Link>}
            {userId && (
              <form action={toggleListed.bind(null, a.id, !a.listed)}>
                <button className="btn btn-secondary btn-sm" type="submit">{a.listed ? "Hide from members" : "Show to members"}</button>
              </form>
            )}
            <form action={toggleAffiliate.bind(null, a.id, !a.active)}>
              <button className="btn btn-secondary btn-sm" type="submit">{a.active ? "Turn off" : "Turn on"}</button>
            </form>
            <form action={deleteAffiliate.bind(null, a.id)}>
              <ConfirmButton message={`Delete ${a.name} (${a.code}) for good? Their clicks, payouts and login go with it.`} className="btn btn-secondary btn-sm text-red">Delete</ConfirmButton>
            </form>
          </div>
          <form action={updateAffiliate.bind(null, a.id)} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
            <label className="field"><span>Their %</span><input name="pct" type="number" min={0} max={100} defaultValue={Number(a.commission_pct)} className="field-input w-20" /></label>
            <label className="field flex-1 min-w-[160px]"><span>Notes</span><input name="notes" defaultValue={a.notes ?? ""} className="field-input w-full" /></label>
            <button className="btn btn-secondary btn-sm" type="submit">Save</button>
          </form>
        </Block>
      </div>
    </details>
  );
}

/** One labelled part of an opened row. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-panel p-3">
      <h3 className="text-[10px] uppercase tracking-[0.1em] font-bold text-ink-soft mb-2">{title}</h3>
      {children}
    </section>
  );
}

const STATUS: Record<string, { label: string; badge: string }> = {
  paying: { label: "Paying", badge: "badge-prime" },
  trial: { label: "Free trial", badge: "badge-ok" },
  unconfirmed: { label: "Not confirmed", badge: "badge-warn" },
  free: { label: "No plan", badge: "badge-muted" },
  lapsed: { label: "Left", badge: "badge-muted" },
};

/** "Every day, monthly", or a dash with no plan. */
function planText(m: AffiliateMember): string {
  const p = m.plan ? planById(m.plan) : undefined;
  if (!p || m.status === "free" || m.status === "unconfirmed") return "";
  return m.term && TERM[m.term] ? `${p.name}, ${TERM[m.term]}` : p.name;
}
