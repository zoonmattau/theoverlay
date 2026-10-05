import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin, now } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { type Area, activityReport, AREA_LABEL, daysOfViews } from "@/lib/activity";
import { LiveNow } from "@/components/LiveNow";
import { LiveRefresh } from "@/components/LiveRefresh";
import { moneyReport } from "@/lib/money";
import { DayChart } from "@/components/DayChart";
import type { Series } from "@/lib/reports";
import { BarList, BarRow } from "../BarList";
import { Fold } from "../Fold";
import { BookieClicks, PlanClicks } from "./Clicks";

/** The windows, in days, then every day since the first page view. */
const WINDOWS = [1, 7, 14, 30, 90];

export const metadata: Metadata = { title: "Activity", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/admin/activity">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dayLabel = (day: string) => new Date(`${day}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

/**
 * What people do on the site, as pictures: the headline counts against the
 * window before, views by day and by rolling week, then where they go and
 * where they came from as bars. Any bar or day opens the people behind it.
 */
async function Activity({ searchParams }: { searchParams: PageProps<"/admin/activity">["searchParams"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const sp = await searchParams;
  const all = sp.days === "all";
  const days = all ? await daysOfViews() : WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 7;
  // What links carry to keep the window: "all" stays all as the days go by.
  const param = all ? "all" : String(days);
  const cut = { area: typeof sp.area === "string" && sp.area ? (sp.area as Area) : undefined, day: typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : undefined };
  const [r, money] = await Promise.all([activityReport(days, cut, !all), moneyReport(days)]);
  // Every day in the window, oldest first, a quiet day as nought, for the charts.
  const window = Array.from({ length: days }, (_, i) => new Date(now() - (days - 1 - i) * 86400_000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }));
  const perDay = new Map(r.byDay.map((d) => [d.day, d]));
  const series = (key: "views" | "people" | "ads", title: string): Series => {
    const points = window.map((date) => ({ date, value: perDay.get(date)?.[key] ?? 0 }));
    return { key, title, format: "count", points, total: points.reduce((a, p) => a + p.value, 0) };
  };
  // A rolling week has no sum worth showing: its figure is the latest week.
  const rolling = (key: "views" | "people", title: string): Series => {
    const points = r.rolling.map((d) => ({ date: d.day, value: d[key] }));
    return { key: `week-${key}`, title, format: "count", points, total: points.at(-1)?.value ?? 0, totalLabel: "this week" };
  };
  const span = all ? "since the first view" : days === 1 ? "today" : `in the last ${days} days`;
  const versus = days === 1 ? "yesterday" : `the ${days} days before`;
  // Followers grouped by tipster, most first.
  const followers = Object.entries(
    r.follows.reduce<Record<string, typeof r.follows>>((acc, f) => {
      (acc[f.tipster] ??= []).push(f);
      return acc;
    }, {}),
  ).sort((a, b) => b[1].length - a[1].length);
  const mostFollowed = Math.max(1, ...followers.map(([, list]) => list.length));

  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-ink-soft">Who uses the site {span}. Click any bar or day for the people behind it. Admin views are not counted.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {WINDOWS.map((d) => (
            <Link key={d} href={`/admin/activity?days=${d}`} className={`btn btn-sm ${!all && d === days ? "btn-primary" : "btn-secondary"}`}>{d === 1 ? "Today" : `${d} days`}</Link>
          ))}
          <Link href="/admin/activity?days=all" className={`btn btn-sm ${all ? "btn-primary" : "btn-secondary"}`}>All time</Link>
        </div>
      </section>

      <LiveRefresh seconds={30} />
      <LiveNow />
      {r.views === 0 ? (
        <div className="card text-sm text-ink-soft">Nothing recorded yet. Views start counting from the next deploy; give it a day.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Tile n={r.views} was={r.before?.views} label="page views" versus={versus} />
            <Tile n={r.reach} was={r.before?.reach} label="people" versus={versus} />
            <Tile n={r.members} was={r.before?.members} label="members" versus={versus} />
            <Tile n={r.visitors} was={r.before?.visitors} label="visitors, no account" versus={versus} />
          </div>

          {days > 1 && (
            <Fold title="Page views a day" className="mb-4">
              <p className="text-xs text-ink-soft mb-3">Click a day for who came.</p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <DayChart s={series("views", "Page views")} hrefBase={`/admin/activity?days=${param}&day=`} />
                <DayChart s={series("people", "People")} hrefBase={`/admin/activity?days=${param}&day=`} />
                <DayChart s={series("ads", "People from ads")} hrefBase={`/admin/activity?days=${param}&day=`} />
              </div>
            </Fold>
          )}

          {days > 1 && (
            <Fold title="Rolling 7 days" className="mb-4">
              <p className="text-xs text-ink-soft mb-3">Each day is the week ending on it, so race days don&apos;t swing it. People counts each person once across the week.</p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <DayChart s={rolling("views", "Views, last 7 days")} />
                <DayChart s={rolling("people", "People, last 7 days")} />
              </div>
            </Fold>
          )}

          {/* Two stacks, each card at its own height, so a short card never leaves a hole beside a tall one. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
            <div className="flex flex-col gap-4 min-w-0">
              <Fold title="Where they go">
                <p className="text-xs text-ink-soft mb-2">Page views by part of the site. Click one for who looked.</p>
                <BarList items={r.byArea.map((a) => ({
                  key: a.area,
                  label: AREA_LABEL[a.area] ?? a.area,
                  value: a.views,
                  sub: `${a.people} ${a.people === 1 ? "person" : "people"}`,
                  href: `/admin/activity?days=${param}&area=${a.area}#people`,
                  on: cut.area === a.area,
                }))} />
              </Fold>
              {r.sources.length > 0 && (
                <Fold title="Where they came from">
                  <p className="text-xs text-ink-soft mb-2">People by their first visit in the window. Ads counted from 26 Sep 2026.</p>
                  <BarList items={r.sources.map((x) => ({ key: x.source, label: x.source, value: x.people, tone: x.source.endsWith(" ads") ? "bg-blue" : undefined }))} />
                </Fold>
              )}
              <PlanClicks r={money} />
            </div>
            <div className="flex flex-col gap-4 min-w-0">
              <Fold title="Tipsters they look at">
                <BarList top={5} empty="No tipster page opened." items={r.topTipsters.map((x) => ({ key: x.code, label: x.code, value: x.views, sub: `${x.people} ${x.people === 1 ? "person" : "people"}` }))} />
              </Fold>
              <Fold id="follows" title="Followers by tipster">
                {followers.length === 0 && <p className="text-sm text-ink-soft">Nobody follows a tipster yet.</p>}
                {followers.map(([tipster, list]) => (
                  <details key={tipster} className="group/f">
                    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <BarRow max={mostFollowed} item={{ key: tipster, label: <>{tipster}{list[0]?.tipsterCode && <span className="ml-2 text-xs text-ink-soft">see who</span>}</>, value: list.length, sub: list.length === 1 ? "follower" : "followers" }} />
                    </summary>
                    <ul className="mb-2 ml-2 space-y-1 text-sm">
                      {list.map((f, i) => (
                        <li key={i} className="flex justify-between gap-3"><span>{f.followerId ? <Link href={`/admin/${f.followerId}`} className="underline">{f.follower}</Link> : f.follower}</span><span className="text-ink-soft text-xs">{when(f.since)}</span></li>
                      ))}
                      {list[0]?.tipsterCode && <li><Link href={`/t/${list[0].tipsterCode}`} className="text-xs underline text-ink-soft">Their page</Link></li>}
                    </ul>
                  </details>
                ))}
              </Fold>
              <BookieClicks r={money} />
            </div>
          </div>

          {/* Shut unless a bar or day was clicked: a long list, worth reading only when looking for someone. */}
          <Fold
            id="people"
            closed={!r.cut}
            className="mt-4 overflow-x-auto"
            title={r.cut?.area ? `The ${r.people.length} who looked at ${(AREA_LABEL[r.cut.area] ?? r.cut.area).toLowerCase()}` : r.cut?.day ? `The ${r.people.length} on ${dayLabel(r.cut.day)}` : "Most active"}
          >
            <p className="text-xs text-ink-soft mb-3">
              Members by email. A visitor is a browser with no account: the number is its cookie, the source where its first view in the window came from. {r.cut && <Link href={`/admin/activity?days=${param}`} className="underline">Back to everyone</Link>}
            </p>
            <People people={r.cut ? r.people : r.people.slice(0, 10)} />
            {!r.cut && r.people.length > 10 && (
              <details className="group/more">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-xs font-semibold text-ink-soft mt-2 group-open/more:hidden">Show all {r.people.length}</summary>
                <People people={r.people.slice(10)} />
              </details>
            )}
          </Fold>
        </>
      )}
    </>
  );
}

/** A headline count, and the change on the window before it. */
function Tile({ n, was, label, versus }: { n: number; was?: number; label: string; versus: string }) {
  const pct = was ? Math.round(((n - was) / was) * 100) : undefined;
  return (
    <div className="card text-center">
      <div className="font-display text-2xl font-extrabold tracking-tight nums">{n.toLocaleString("en-AU")}</div>
      <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{label}</div>
      {was !== undefined && (
        <div className={`text-xs font-semibold nums mt-1 ${n > was ? "text-accent" : n < was ? "text-red" : "text-ink-soft"}`} title={`${was.toLocaleString("en-AU")} ${versus}`}>
          {n > was ? "▲" : n < was ? "▼" : "="} {pct === undefined ? "new" : `${Math.abs(pct)}%`} <span className="font-normal text-ink-soft">vs {versus}</span>
        </div>
      )}
    </div>
  );
}

function People({ people }: { people: Awaited<ReturnType<typeof activityReport>>["people"] }) {
  return (
    <table className="data-table stack-sm w-full text-sm whitespace-nowrap">
      <thead><tr><th>Who</th><th>From</th><th className="text-right">Views</th><th className="text-right">Races opened</th><th>Mostly</th><th>Last seen</th></tr></thead>
      <tbody>
        {people.map((p) => (
          <tr key={p.id}>
            <td>{p.email ? <Link href={`/admin/${p.id}`} className="underline">{p.email}</Link> : <span className="text-ink-soft">visitor {p.id.slice(2, 8)}</span>}</td>
            <td data-label="From" className="text-xs text-ink-soft">{p.from ?? "direct"}</td>
            <td data-label="Views" className="text-right nums">{p.views}</td>
            <td data-label="Races opened" className="text-right nums">{p.races}</td>
            <td data-label="Mostly" className="text-xs">{p.areas}</td>
            <td data-label="Last seen" className="text-ink-soft text-xs">{when(p.last)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
