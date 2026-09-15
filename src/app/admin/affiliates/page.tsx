import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { createAffiliate, deleteAffiliate, markPaid, toggleAffiliate, unmarkPaid, updateAffiliate } from "@/app/admin/affiliates/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyLink } from "@/components/CopyLink";
import { isAdmin } from "@/lib/admin";
import { affiliateStats, commissionByMonth } from "@/lib/affiliates";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Affiliates", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/admin/affiliates">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Affiliates searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
const day = (ymd: string) => new Date(`${ymd}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" });
type Params = Record<string, string | string[] | undefined>;
/** Which panel a card shows: ?show=<affiliate id>:<panel>, the last 14 days by default. */
function show(sp: Params, id: string): string {
  const v = typeof sp.show === "string" ? sp.show : "";
  return v.startsWith(`${id}:`) ? v.slice(id.length + 1) : "days";
}
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

async function Affiliates({ searchParams }: { searchParams: PageProps<"/admin/affiliates">["searchParams"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const sp = await searchParams;
  const tab = sp.tab === "payments" ? "payments" : "partners";
  const rows = await affiliateStats();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
  const totals = rows.reduce(
    (t, r) => ({
      clicks: t.clicks + r.clicks,
      signups: t.signups + r.signups,
      paying: t.paying + r.paying,
      revenue: t.revenue + r.revenue_cents,
      commission: t.commission + r.commission_cents,
    }),
    { clicks: 0, signups: 0, paying: 0, revenue: 0, commission: 0 },
  );

  return (
    <>
      <section className="py-6">
        <Link href="/admin" className="text-xs text-ink-soft hover:text-ink">← Overview</Link>
        <h1 className="font-display text-3xl font-extrabold tracking-tight mt-1">Affiliates</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Each partner gets a link, every click and sign-up through it is counted, and commission is worked out on what those members have paid.
        </p>
      </section>

      <div className="tabs mb-5" role="tablist">
        <Link href="/admin/affiliates" role="tab" aria-selected={tab === "partners"} className="tab">Partners</Link>
        <Link href="/admin/affiliates?tab=payments" role="tab" aria-selected={tab === "payments"} className="tab">Payments</Link>
      </div>

      {tab === "payments" ? <Payments /> : (<>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Tile n={totals.clicks} label="clicks" />
        <Tile n={totals.signups} label="sign-ups" />
        <Tile n={totals.paying} label="paying now" tone="prime" />
        <Tile n={money(totals.revenue)} label="revenue attributed" tone="bet" />
        <Tile n={money(totals.commission)} label="commission owed" />
      </div>

      <div className="card mb-6">
        <h2 className="font-display font-extrabold">New affiliate</h2>
        <form action={createAffiliate} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="field"><span>Name</span><input name="name" required className="field-input w-48" placeholder="Punters Podcast" /></label>
          <label className="field"><span>Code</span><input name="code" className="field-input w-36" placeholder="PODCAST" /></label>
          <label className="field"><span>Email</span><input name="email" type="email" required className="field-input w-56" placeholder="the email they log in with" /></label>
          <label className="field"><span>Commission %</span><input name="pct" type="number" min={0} max={100} defaultValue={40} className="field-input w-24" /></label>
          <button className="btn btn-primary btn-sm" type="submit">Create</button>
        </form>
        <p className="mt-2 text-xs text-ink-soft">One step. If the email has no account yet they get an invite to set a password. Their link is {site}/go/CODE, which lands on their page at /t/CODE, and they post tips from Your tips once they are in.</p>
      </div>

      <div className="space-y-4">
        {rows.length === 0 && <p className="text-sm text-ink-soft">No affiliates yet.</p>}
        {rows.map((a) => (
          <details key={a.id} className={`card ${a.active ? "" : "opacity-60"}`} open={typeof sp.show === "string" && sp.show.startsWith(`${a.id}:`)}>
            <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-3">
              <span className="font-display font-extrabold text-lg">
                {a.name} <span className="badge badge-muted ml-1 nums">{a.code}</span>
                {!a.active && <span className="badge badge-warn ml-1">Off</span>}
                {!(a as { user_id?: string | null }).user_id && <span className="badge badge-warn ml-1" title="No account linked, so they cannot post tips">No login</span>}
              </span>
              <span className="nums text-sm text-ink-soft">
                {a.clicks7} {a.clicks7 === 1 ? "click" : "clicks"} this week · {a.signups} {a.signups === 1 ? "sign-up" : "sign-ups"} · {a.paying} paying · {money(a.commission_cents)} commission
              </span>
            </summary>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <p className="text-xs text-ink-soft">
                {a.email ?? "no email"} · {Number(a.commission_pct)}% commission · since{" "}
                {new Date(a.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })}
              </p>
              <div className="flex gap-2">
                <form action={toggleAffiliate.bind(null, a.id, !a.active)}>
                  <button className="btn btn-secondary btn-sm" type="submit">{a.active ? "Turn off" : "Turn on"}</button>
                </form>
                <form action={deleteAffiliate.bind(null, a.id)}>
                  <ConfirmButton message={`Delete ${a.name} (${a.code}) for good? Their clicks, payouts and login go with it.`} className="btn btn-secondary btn-sm text-red">Delete</ConfirmButton>
                </form>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[2fr_3fr]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold mb-1.5">Clicks</div>
                <div className="grid grid-cols-4 gap-2 text-center text-sm">
                  <Stat n={a.clicksToday} label="today" />
                  <Stat n={a.clicks7} label="7 days" />
                  <Stat n={a.clicks30} label="30 days" />
                  <Stat n={a.clicks} label="all" />
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold mb-1.5">Members</div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-sm">
                  <Stat n={a.signups} label="sign-ups" />
                  <Stat n={a.signups30} label="30 days" />
                  <Stat n={`${a.conversion}%`} label="per click" />
                  <Stat n={a.paying} label="paying" tone="prime" />
                  <Stat n={money(a.revenue_cents)} label="revenue" tone="bet" />
                  <Stat n={money(a.commission_cents)} label="commission" />
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-soft">{a.lastClickAt ? `Last click ${when(a.lastClickAt)}.` : "No clicks yet."}</p>

            <div className="tabs mt-4 text-xs" role="tablist">
              <Link href={`/admin/affiliates?show=${a.id}:days`} scroll={false} role="tab" aria-selected={show(sp, a.id) === "days"} className="tab">Last 14 days</Link>
              <Link href={`/admin/affiliates?show=${a.id}:clicks`} scroll={false} role="tab" aria-selected={show(sp, a.id) === "clicks"} className="tab">Recent clicks ({a.recentClicks.length})</Link>
              <Link href={`/admin/affiliates?show=${a.id}:members`} scroll={false} role="tab" aria-selected={show(sp, a.id) === "members"} className="tab">Sign-ups ({a.members.length})</Link>
              <Link href={`/admin/affiliates?show=${a.id}:settings`} scroll={false} role="tab" aria-selected={show(sp, a.id) === "settings"} className="tab">Link and terms</Link>
            </div>
            <div className="mt-3 overflow-x-auto">
              {show(sp, a.id) === "days" && (
                <table className="data-table text-xs">
                  <thead><tr><th>Day</th><th className="text-right">Clicks</th><th className="text-right">Sign-ups</th></tr></thead>
                  <tbody>
                    {a.days.map((d) => (
                      <tr key={d.date}><td className="nums">{day(d.date)}</td><td className="text-right nums">{d.clicks}</td><td className="text-right nums">{d.signups}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              {show(sp, a.id) === "clicks" && (a.recentClicks.length === 0 ? <p className="text-xs text-ink-soft">No clicks yet.</p> : (
                <table className="data-table text-xs">
                  <thead><tr><th>When</th><th>Device</th><th>Landed on</th><th>Came from</th></tr></thead>
                  <tbody>
                    {a.recentClicks.map((c, i) => (
                      <tr key={i}>
                        <td className="nums whitespace-nowrap">{when(c.created_at)}</td>
                        <td>{c.device}</td>
                        <td className="text-ink-secondary">{c.landing ?? "/"}</td>
                        <td className="text-ink-secondary">{c.referrer ? host(c.referrer) : "direct"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
              {show(sp, a.id) === "members" && (a.members.length === 0 ? <p className="text-xs text-ink-soft">No sign-ups yet.</p> : (
                <table className="data-table text-xs">
                  <thead><tr><th>Joined</th><th>Member</th><th>Status</th><th>Plan</th><th className="text-right">Spent</th><th>Last seen</th></tr></thead>
                  <tbody>
                    {a.members.map((m) => (
                      <tr key={m.id}>
                        <td className="nums whitespace-nowrap">{when(m.created_at)}</td>
                        <td><Link href={`/admin/${m.id}`} className="font-semibold hover:text-blue">{m.email ?? m.id}</Link></td>
                        <td><span className={`badge ${m.status === "paying" ? "badge-prime" : m.status === "trial" ? "badge-ok" : "badge-muted"}`}>{m.status}</span></td>
                        <td className="text-ink-secondary">{m.plan ?? "—"}</td>
                        <td className="text-right nums">{m.spent_cents > 0 ? money(m.spent_cents) : "—"}</td>
                        <td className="nums whitespace-nowrap text-ink-secondary">{m.last_seen_at ? when(m.last_seen_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
              {show(sp, a.id) === "settings" && (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Link</div>
                <CopyLink link={`${site}/go/${a.code}`} />
              </div>
              <form action={updateAffiliate.bind(null, a.id)} className="flex flex-wrap items-end gap-2 text-sm">
                <label className="field"><span>Commission %</span><input name="pct" type="number" min={0} max={100} defaultValue={Number(a.commission_pct)} className="field-input w-24" /></label>
                <label className="field flex-1 min-w-[160px]"><span>Notes</span><input name="notes" defaultValue={a.notes ?? ""} className="field-input w-full" placeholder="Paid to, agreed terms" /></label>
                <button className="btn btn-secondary btn-sm" type="submit">Save</button>
              </form>
            </div>
              )}
            </div>
          </details>
        ))}
      </div>
      </>)}
    </>
  );
}

/** Commission owed by month, and what has been paid. */
async function Payments() {
  const rows = await commissionByMonth();
  const owed = rows.filter((r) => r.paid_at === null).reduce((a, r) => a + r.commission_cents, 0);
  const paid = rows.reduce((a, r) => a + (r.paid_cents ?? 0), 0);
  const label = (m: string) => new Date(`${m}-15T12:00:00+10:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tile n={money(owed)} label="owed, unpaid months" tone="prime" />
        <Tile n={money(paid)} label="paid out, all time" />
        <Tile n={rows.filter((r) => r.paid_at === null && r.commission_cents > 0).length} label="months to pay" />
        <Tile n={rows.length} label="affiliate months" />
      </div>
      <div className="card">
        <p className="text-sm text-ink-soft mb-3">Commission is each affiliate&apos;s percentage of what their members paid in the month, on the amount charged. Mark a month paid once the transfer has gone; the amount defaults to what is owed.</p>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-soft">No payments from referred members yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table text-sm">
              <thead><tr><th>Month</th><th>Affiliate</th><th className="text-right">Payments</th><th className="text-right">Revenue</th><th className="text-right">Rate</th><th className="text-right">Owed</th><th>Paid</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.affiliate.id}:${r.month}`}>
                    <td className="nums">{label(r.month)}</td>
                    <td className="font-semibold">{r.affiliate.name} <span className="badge badge-muted ml-1 nums">{r.affiliate.code}</span></td>
                    <td className="text-right nums">{r.payments}</td>
                    <td className="text-right nums">{money(r.revenue_cents)}</td>
                    <td className="text-right nums">{Number(r.affiliate.commission_pct)}%</td>
                    <td className="text-right nums font-semibold">{money(r.commission_cents)}</td>
                    <td>
                      {r.paid_at ? (
                        <span className="badge badge-prime">{money(r.paid_cents ?? 0)} on {new Date(r.paid_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })}{r.note ? `, ${r.note}` : ""}</span>
                      ) : (
                        <span className="badge badge-warn">Unpaid</span>
                      )}
                    </td>
                    <td>
                      {r.paid_at ? (
                        <form action={unmarkPaid.bind(null, r.affiliate.id, r.month)}><button className="btn btn-secondary btn-sm" type="submit">Undo</button></form>
                      ) : (
                        <form action={markPaid.bind(null, r.affiliate.id, r.month)} className="flex items-center gap-2">
                          <input name="amount" type="number" step="0.01" min={0} defaultValue={(r.commission_cents / 100).toFixed(2)} className="field-input w-24 py-1 text-xs" aria-label="Amount paid" />
                          <input name="note" placeholder="Reference" className="field-input w-28 py-1 text-xs" aria-label="Reference" />
                          <button className="btn btn-primary btn-sm" type="submit">Mark paid</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
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

function Stat({ n, label, tone }: { n: number | string; label: string; tone?: "prime" | "bet" }) {
  const cls = tone === "prime" ? "bg-lime-soft" : tone === "bet" ? "bg-blue-soft" : "bg-panel-alt";
  return (
    <div className={`rounded-md py-2 ${cls}`}>
      <div className="font-display font-extrabold nums">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-soft font-bold">{label}</div>
    </div>
  );
}
