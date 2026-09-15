import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { rebuildCard, resendTips, setFreeRace } from "@/app/admin/actions";
import { isAdmin, listMembers, overview, recentEvents } from "@/lib/admin";
import { getTodayCard } from "@/lib/model/source";
import { getViewer } from "@/lib/auth";
import { planById } from "@/lib/billing/plans";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function Page() {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Admin />
      </Suspense>
    </div>
  );
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const jump = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "");
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

async function Admin() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const members = await listMembers();
  const [stats, events, card] = await Promise.all([overview(members), recentEvents(undefined, 40), getTodayCard()]);
  const races = card.meetings.reduce((a, m) => a + m.races.length, 0);
  const calls = card.meetings.flatMap((m) => m.races.flatMap((r) => r.runners.filter((x) => x.signal && !x.scratched)));
  const lastMail = events.find((e) => e.kind === "tips_email");
  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-ink-soft">Members, money and what people click.</p>
        </div>
      </section>

      <div className="card mb-6 flex flex-wrap items-center gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Today&apos;s card</div>
          <div className="mt-0.5 nums">
            {card.date}: {card.meetings.length} meetings, {races} races, {calls.filter((x) => x.signal === "back").length} bets, {calls.filter((x) => x.signal === "lay").length} lays. Built {when(card.builtAt)}.
            {lastMail ? ` Tips email sent ${when(lastMail.created_at)} to ${String((lastMail.meta as { sent?: number })?.sent ?? 0)}.` : " No tips email sent yet."}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <form action={rebuildCard}><button className="btn btn-secondary btn-sm" type="submit">Rebuild today</button></form>
          <form action={resendTips}><button className="btn btn-secondary btn-sm" type="submit">Resend tips email</button></form>
        </div>
        <form action={setFreeRace} className="basis-full flex flex-wrap items-center gap-2">
          <label htmlFor="free-race" className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Free race</label>
          <select id="free-race" name="raceId" defaultValue={card.freeRaceId ?? ""} className="field-input py-1 text-xs max-w-xs">
            <option value="">Automatic</option>
            {card.meetings.map((m) => (
              <optgroup key={m.meetingId} label={m.track}>
                {m.races.map((r) => (
                  <option key={r.raceId} value={r.raceId}>{m.track} R{r.raceNumber} {jump(r.jumpTime)}{r.raceId === card.freeRaceId ? " (current)" : ""}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" type="submit">Set free race</button>
          <span className="text-xs text-ink-soft">Automatic draws one of the day's bets at random and keeps it all day. A pin stays until you clear it.</span>
        </form>
      </div>

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
