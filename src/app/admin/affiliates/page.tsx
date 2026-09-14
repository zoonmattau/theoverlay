import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { createAffiliate, linkTipster, toggleAffiliate, updateAffiliate } from "@/app/admin/affiliates/actions";
import { CopyLink } from "@/components/CopyLink";
import { isAdmin } from "@/lib/admin";
import { affiliateStats } from "@/lib/affiliates";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Affiliates", robots: { index: false } };

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

async function Affiliates() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
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
        <Link href="/admin" className="text-xs text-ink-soft hover:text-ink">← Admin</Link>
        <h1 className="font-display text-3xl font-extrabold tracking-tight mt-1">Affiliates</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Each partner gets a link, every click and sign-up through it is counted, and commission is worked out on what those members have paid.
        </p>
      </section>

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
          <label className="field"><span>Email</span><input name="email" type="email" className="field-input w-56" placeholder="optional" /></label>
          <label className="field"><span>Commission %</span><input name="pct" type="number" min={0} max={100} defaultValue={20} className="field-input w-24" /></label>
          <label className="field"><span>Tipster login</span><input name="login" type="email" className="field-input w-56" placeholder="their account email, optional" /></label>
          <button className="btn btn-primary btn-sm" type="submit">Create</button>
        </form>
        <p className="mt-2 text-xs text-ink-soft">Their link becomes {site}/go/CODE, and ?to=/pricing on the end lands them on a page. A tipster login makes them a tipster: they post at /tipster and their link lands on /t/CODE.</p>
      </div>

      <div className="space-y-4">
        {rows.length === 0 && <p className="text-sm text-ink-soft">No affiliates yet.</p>}
        {rows.map((a) => (
          <div key={a.id} className={`card ${a.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-extrabold text-lg">
                  {a.name} <span className="badge badge-muted ml-1 nums">{a.code}</span>
                  {!a.active && <span className="badge badge-warn ml-1">Off</span>}
                </h3>
                <p className="text-xs text-ink-soft">
                  {a.email ?? "no email"} · {Number(a.commission_pct)}% commission · since{" "}
                  {new Date(a.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })}
                </p>
              </div>
              <form action={toggleAffiliate.bind(null, a.id, !a.active)}>
                <button className="btn btn-secondary btn-sm" type="submit">{a.active ? "Turn off" : "Turn on"}</button>
              </form>
            </div>
            <div className="mt-3 grid grid-cols-3 md:grid-cols-6 gap-3 text-center text-sm">
              <Stat n={a.clicks} label="clicks" />
              <Stat n={a.clicks30} label="clicks, 30d" />
              <Stat n={a.signups} label="sign-ups" />
              <Stat n={a.paying} label="paying now" />
              <Stat n={money(a.revenue_cents)} label="revenue" />
              <Stat n={money(a.commission_cents)} label="commission" />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
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
            <form action={linkTipster.bind(null, a.id)} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
              <label className="field flex-1 min-w-[220px]"><span>Tipster login {(a as { user_id?: string | null }).user_id ? "(linked)" : "(not linked)"}</span><input name="email" type="email" className="field-input w-full" placeholder="The email they log in with, blank to unlink" /></label>
              <button className="btn btn-secondary btn-sm" type="submit">Link</button>
            </form>
          </div>
        ))}
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

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-md bg-panel-alt py-2">
      <div className="font-display font-extrabold nums">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-soft font-bold">{label}</div>
    </div>
  );
}
