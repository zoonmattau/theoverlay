import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { rebuildCard, resendTips, setFreeRace } from "@/app/admin/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActivityFeed } from "@/components/ActivityFeed";
import { isAdmin, listMembers, now, overview, recentEvents } from "@/lib/admin";
import { getTodayCard } from "@/lib/model/source";
import { getViewer } from "@/lib/auth";
import { planById } from "@/lib/billing/plans";
import { longDate } from "@/lib/format";
import { todayFacts } from "@/lib/today";

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
const jump = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "");
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

async function Admin({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const sp = await searchParams;
  const activity = typeof sp.activity === "string" && ["money", "members", "admin"].includes(sp.activity) ? sp.activity : "all";
  const members = await listMembers();
  const [stats, events, card, facts] = await Promise.all([overview(members), recentEvents(undefined, 80), getTodayCard(), todayFacts()]);
  const races = card.meetings.reduce((a, m) => a + m.races.length, 0);
  const calls = card.meetings.flatMap((m) => m.races.flatMap((r) => r.runners.filter((x) => x.signal && !x.scratched)));
  const nextCall = card.meetings
    .flatMap((m) => m.races.flatMap((r) => r.runners.filter((x) => x.signal && !x.scratched).map((x) => ({ m, r, x }))))
    .filter(({ r }) => !r.result?.length && r.jumpTime && new Date(r.jumpTime).getTime() > now())
    .sort((a, b) => a.r.jumpTime!.localeCompare(b.r.jumpTime!))[0];
  const lastMail = events.find((e) => e.kind === "tips_email");
  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-ink-soft">The day at a glance. Every number opens the page behind it.</p>
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
          <ActionButton action={rebuildCard} busy="Rebuilding, about a minute">Rebuild today</ActionButton>
          <ActionButton action={resendTips} busy="Sending">Resend tips email</ActionButton>
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
          <span className="text-xs text-ink-soft">Automatic draws one of the day&apos;s bets at random and keeps it all day. A pin stays until you clear it.</span>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
        <Panel title="Racing" href="/tips" cta="Today's card">
          <Fact n={calls.filter((x) => x.signal === "back").length} label={facts.bets.settled ? `bets, ${facts.bets.won} of ${facts.bets.settled} won, ${units(facts.bets.units)}, ${facts.bets.calls - facts.bets.settled} to run` : "bets on the card"} tone={facts.bets.settled ? facts.bets.units : undefined} />
          <Fact n={calls.filter((x) => x.signal === "lay").length} label={facts.lays.settled ? `lays, ${facts.lays.held} of ${facts.lays.settled} held, ${units(facts.lays.units)}, ${facts.lays.calls - facts.lays.settled} to run` : "lays on the card"} tone={facts.lays.settled ? facts.lays.units : undefined} />
          {nextCall ? (
            <Link href={`/racing/${card.date}/${nextCall.m.meetingId}/${nextCall.r.raceId}`} className="block text-xs underline mt-1">
              Next call: {nextCall.m.track} R{nextCall.r.raceNumber} {jump(nextCall.r.jumpTime)}, {nextCall.x.horseName}
            </Link>
          ) : (
            <span className="block text-xs text-ink-soft mt-1">No call still to run.</span>
          )}
          <div className="flex flex-wrap gap-x-3 mt-2 text-xs">
            <Link href="/admin/reports" className="underline">Record</Link>
            {facts.review && (
              <Link href={`/admin/review/${facts.review.date}`} className="underline">
                Review {longDate(facts.review.date).replace(/, \d{4}$/, "")}: {facts.review.published ? "published" : facts.review.runs ? `${facts.review.runs} runs, not published` : "not fetched"}
              </Link>
            )}
          </div>
        </Panel>
        <Panel title="People" href="/admin/members" cta="Members">
          <Fact n={stats.members} label="accounts" />
          <Fact n={stats.active} label={`with access, ${stats.trialling} on trial`} />
          <Fact n={stats.signupsWeek} label="sign-ups, 7 days" />
          <Link href="/admin/activity" className="block text-xs underline mt-1">
            {facts.views} page views today from {facts.people} {facts.people === 1 ? "person" : "people"}
          </Link>
        </Panel>
        <Panel title="Tipsters" href="/admin/affiliates" cta="Tipsters and affiliates">
          <Fact n={facts.tipsterCalls} label="calls posted today" />
          <Fact n={facts.follows} label="follows in total" />
          <Link href="/admin/activity#follows" className="block text-xs underline mt-1">Who follows whom</Link>
          <Link href="/tipsters" className="block text-xs underline">The tipsters page as members see it</Link>
        </Panel>
        <Panel title="Money" href="/admin/money" cta="Money">
          <Fact n={money(stats.revenue)} label="revenue, all time" />
          <Fact n={Object.values(stats.clicksByPlan).reduce((a, b) => a + b, 0)} label="plan clicks, 7 days" />
          <div className="mt-1 text-xs text-ink-soft">
            {Object.entries(stats.byPlan).length === 0 ? "Nobody on a plan yet." : Object.entries(stats.byPlan).map(([p, n]) => `${planById(p)?.name ?? p} ${n}`).join(" · ")}
          </div>
        </Panel>
      </div>

      <ActivityFeed events={events} members={members} filter={activity} base="/admin" />
    </>
  );
}

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(2)}u`;

/** One banner of the overview: a heading that opens its page, a few facts, and links sideways. */
function Panel({ title, href, cta, children }: { title: string; href: string; cta: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display font-extrabold">{title}</h2>
        <Link href={href} className="text-xs underline text-ink-soft whitespace-nowrap">{cta} →</Link>
      </div>
      {children}
    </div>
  );
}

function Fact({ n, label, tone }: { n: number | string; label: string; tone?: number }) {
  const cls = tone === undefined ? "" : tone > 0 ? "text-accent" : tone < 0 ? "text-red" : "";
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-display text-xl font-extrabold tracking-tight nums ${cls}`}>{n}</span>
      <span className="text-[11px] uppercase tracking-[0.06em] font-bold text-ink-soft">{label}</span>
    </div>
  );
}

