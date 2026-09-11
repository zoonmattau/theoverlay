import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin, listMembers, now as clock, overview, recentEvents } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { planById } from "@/lib/billing/plans";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/admin">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Admin searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }) : "—");
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

async function Admin({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const [stats, members, events] = await Promise.all([overview(), listMembers(q || undefined), recentEvents(undefined, 40)]);
  const now = clock();

  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-ink-soft">Members, money and what people click.</p>
        </div>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search email" className="field-input" />
          <button className="btn btn-secondary" type="submit">Search</button>
        </form>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Tile n={stats.members} label="members" />
        <Tile n={stats.active} label="active access" tone="prime" />
        <Tile n={stats.trialling} label="on trial" />
        <Tile n={stats.signupsWeek} label="sign-ups, 7 days" />
        <Tile n={money(stats.revenue)} label="revenue, all time" tone="bet" />
        <Tile n={Object.values(stats.clicksByPlan).reduce((a, b) => a + b, 0)} label="plan clicks, 7 days" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="card">
          <h2 className="font-display font-extrabold mb-2">Active by plan</h2>
          {Object.entries(stats.byPlan).length === 0 && <p className="text-sm text-ink-soft">Nobody yet.</p>}
          {Object.entries(stats.byPlan).map(([p, n]) => (
            <div key={p} className="panel-row">
              <span>{planById(p)?.name ?? p}</span>
              <span className="nums font-bold">{n}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 className="font-display font-extrabold mb-2">Plan clicks, last 7 days</h2>
          {Object.entries(stats.clicksByPlan).length === 0 && <p className="text-sm text-ink-soft">None yet.</p>}
          {Object.entries(stats.clicksByPlan).map(([p, n]) => (
            <div key={p} className="panel-row">
              <span>{planById(p)?.name ?? p}</span>
              <span className="nums font-bold">{n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section mb-6">
        <div className="section-bar">
          <span className="section-letter">M</span>
          <h2>Members</h2>
          <span className="aside nums">{members.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table text-sm min-w-[980px]">
            <thead>
              <tr>
                <th>Email</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Access until</th>
                <th>Since</th>
                <th className="text-right">Spent</th>
                <th className="text-right">Passes</th>
                <th>Gift until</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const live = m.access_until && new Date(m.access_until).getTime() > now && !m.paused_at;
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/admin/${m.id}`} className="font-semibold hover:text-blue">
                        {m.email ?? m.id}
                      </Link>
                    </td>
                    <td>{m.plan ? (planById(m.plan)?.name ?? m.plan) : "—"}</td>
                    <td>
                      {m.paused_at ? (
                        <span className="badge badge-warn">Paused</span>
                      ) : live ? (
                        <span className="badge badge-prime">{m.subscription_status ?? "active"}</span>
                      ) : (
                        <span className="badge badge-muted">{m.subscription_status ?? "none"}</span>
                      )}
                    </td>
                    <td className="nums">{day(m.access_until)}</td>
                    <td className="nums">{day(m.subscribed_since)}</td>
                    <td className="text-right nums">{money(m.total_spent_cents ?? 0)}</td>
                    <td className="text-right nums">{m.pass_credits}</td>
                    <td className="nums">{m.bonus_until && new Date(m.bonus_until).getTime() > now ? day(m.bonus_until) : "—"}</td>
                    <td className="nums">{day(m.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <div className="section-bar">
          <span className="section-letter">E</span>
          <h2>Recent activity</h2>
        </div>
        <ul className="divide-y divide-line-soft">
          {events.length === 0 && <li className="p-4 text-sm text-ink-soft">Nothing yet.</li>}
          {events.map((e) => {
            const m = members.find((x) => x.id === e.user_id);
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span className="nums text-ink-soft w-28">{when(e.created_at)}</span>
                <span className="badge badge-muted">{e.kind}</span>
                <span className="font-semibold">{m?.email ?? e.user_id ?? "visitor"}</span>
                {e.plan && <span className="text-ink-secondary">{planById(e.plan)?.name ?? e.plan}</span>}
                {e.amount_cents ? <span className="nums">{money(e.amount_cents)}</span> : null}
                {e.meta && <span className="text-xs text-ink-soft">{JSON.stringify(e.meta)}</span>}
              </li>
            );
          })}
        </ul>
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
