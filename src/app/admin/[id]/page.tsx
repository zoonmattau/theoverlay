import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { addDays, addPasses, cancelMember, pauseMember, resumeMember, saveNote, setAdmin } from "@/app/admin/actions";
import { getMember, isAdmin, memberEvents, now as clock, referralsMade } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { planById } from "@/lib/billing/plans";

export const metadata: Metadata = { title: "Member", robots: { index: false } };

export default function Page({ params }: PageProps<"/admin/[id]">) {
  return (
    <div className="page max-w-4xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Member params={params} />
      </Suspense>
    </div>
  );
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const stamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "—";
const daysBetween = (a: string, b: number) => Math.max(0, Math.round((b - new Date(a).getTime()) / 86400_000));

async function Member({ params }: { params: PageProps<"/admin/[id]">["params"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const { id } = await params;
  const [m, events, invites] = await Promise.all([getMember(id), memberEvents(id), referralsMade(id)]);
  if (!m) notFound();
  const now = clock();
  const live = m.access_until && new Date(m.access_until).getTime() > now;
  const giftLive = m.bonus_until && new Date(m.bonus_until).getTime() > now;
  const plan = planById(m.plan ?? undefined);

  return (
    <>
      <div className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-xs text-ink-soft hover:text-ink">← All members</Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight mt-1">{m.email ?? m.id}</h1>
          <p className="mt-1 text-sm text-ink-soft nums">
            Joined {stamp(m.created_at)} · {m.marketing_opt_in ? "emails on" : "emails off"} · invite code {m.referral_code ?? "none"} · {invites} {invites === 1 ? "friend" : "friends"} joined
          </p>
        </div>
        <div className="flex gap-2">
          {m.is_admin && <span className="badge badge-prime">Admin</span>}
          {m.paused_at ? <span className="badge badge-warn">Paused</span> : live ? <span className="badge badge-prime">{m.subscription_status ?? "active"}</span> : <span className="badge badge-muted">no access</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tile n={money(m.total_spent_cents ?? 0)} label="spent" />
        <Tile n={m.subscribed_since ? `${daysBetween(m.subscribed_since, now)}d` : "—"} label="subscribed for" />
        <Tile n={m.access_until ? stamp(m.access_until).split(",")[0] : "—"} label={live ? "sub renews / ends" : "sub ended"} />
        <Tile n={m.pass_credits} label="passes unused" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="card space-y-2 text-sm">
          <h2 className="font-display font-extrabold">Subscription</h2>
          <Row k="Plan" v={plan?.name ?? m.plan ?? "—"} />
          <Row k="Status" v={m.subscription_status ?? "—"} />
          <Row k="Since" v={stamp(m.subscribed_since)} />
          <Row k="Access until" v={stamp(m.access_until)} />
          <Row k="Paused" v={m.paused_at ? stamp(m.paused_at) : "no"} />
          <Row k="Gift until" v={giftLive ? stamp(m.bonus_until) : "—"} />
          <Row k="Stripe customer" v={m.stripe_customer_id ? <a className="text-blue" href={`https://dashboard.stripe.com/customers/${m.stripe_customer_id}`} target="_blank" rel="noreferrer">{m.stripe_customer_id}</a> : "—"} />
        </div>

        <div className="card space-y-3 text-sm">
          <h2 className="font-display font-extrabold">Actions</h2>
          <form action={addDays.bind(null, m.id, 14)} className="flex items-center gap-2">
            <button className="btn btn-primary btn-sm" type="submit">Add 14 days</button>
            <span className="text-ink-soft">full board, on top of anything running</span>
          </form>
          <form action={async (fd) => { "use server"; await addDays(m.id, Number(fd.get("days"))); }} className="flex items-center gap-2">
            <input name="days" type="number" defaultValue={7} className="field-input w-24" />
            <button className="btn btn-secondary btn-sm" type="submit">Add days</button>
            <span className="text-ink-soft">negative takes them away</span>
          </form>
          <form action={async (fd) => { "use server"; await addPasses(m.id, Number(fd.get("qty"))); }} className="flex items-center gap-2">
            <input name="qty" type="number" defaultValue={1} className="field-input w-24" />
            <button className="btn btn-secondary btn-sm" type="submit">Add passes</button>
          </form>
          <div className="flex flex-wrap gap-2 pt-2 border-t border-line-soft">
            {m.paused_at ? (
              <form action={resumeMember.bind(null, m.id)}><button className="btn btn-primary btn-sm" type="submit">Resume</button></form>
            ) : (
              <form action={pauseMember.bind(null, m.id)}><button className="btn btn-secondary btn-sm" type="submit">Pause</button></form>
            )}
            {m.stripe_subscription_id && (
              <form action={cancelMember.bind(null, m.id)}><button className="btn btn-secondary btn-sm text-red" type="submit">Cancel at period end</button></form>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line-soft">
            {m.is_admin ? (
              <form action={setAdmin.bind(null, m.id, false)}><button className="btn btn-secondary btn-sm text-red" type="submit" disabled={m.id === viewer.id}>Remove admin</button></form>
            ) : (
              <form action={setAdmin.bind(null, m.id, true)}><button className="btn btn-secondary btn-sm" type="submit">Make admin</button></form>
            )}
            <span className="text-ink-soft">admins see every race free and can open this panel</span>
          </div>
          <form action={async (fd) => { "use server"; await saveNote(m.id, String(fd.get("note") ?? "")); }} className="pt-2 border-t border-line-soft">
            <label className="field"><span>Note</span><textarea name="note" defaultValue={m.admin_note ?? ""} rows={3} className="field-input w-full" /></label>
            <button className="btn btn-secondary btn-sm mt-2" type="submit">Save note</button>
          </form>
        </div>
      </div>

      <div className="section">
        <div className="section-bar">
          <span className="section-letter">E</span>
          <h2>Activity</h2>
        </div>
        <ul className="divide-y divide-line-soft">
          {events.length === 0 && <li className="p-4 text-sm text-ink-soft">Nothing yet.</li>}
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <span className="nums text-ink-soft w-40">{stamp(e.created_at)}</span>
              <span className="badge badge-muted">{e.kind}</span>
              {e.plan && <span>{planById(e.plan)?.name ?? e.plan}</span>}
              {e.amount_cents ? <span className="nums font-semibold">{money(e.amount_cents)}</span> : null}
              {e.meta && <span className="text-xs text-ink-soft">{JSON.stringify(e.meta)}</span>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line-soft pt-2 first:border-t-0 first:pt-0">
      <span className="text-ink-soft">{k}</span>
      <span className="nums text-right">{v}</span>
    </div>
  );
}

function Tile({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="card text-center">
      <div className="font-display text-xl font-extrabold tracking-tight nums">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{label}</div>
    </div>
  );
}
