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
/** "caulfield-heath-20260916" and "CAUH_160926_6" read as "Caulfield Heath R6". */
const raceName = (meetingId: string, raceId: string) => {
  const track = meetingId.replace(/-\d{8}$/, "").replace(/-[a-z]{1,2}$/, "").split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
  const n = raceId.match(/_(\d+)$/)?.[1];
  return n ? `${track} R${n}` : `${track} ${raceId}`;
};
const dayLabel = (day: string) => new Date(`${day}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

function Bar({ n, max }: { n: number; max: number }) {
  return (
    <span className="inline-block h-2 rounded-full bg-lime align-middle" style={{ width: `${Math.max(2, (100 * n) / Math.max(1, max))}%`, maxWidth: 160 }} />
  );
}

/** What people do on the site: where they go, which races and tipsters, who follows whom, who is most active. */
async function Activity({ searchParams }: { searchParams: PageProps<"/admin/activity">["searchParams"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const sp = await searchParams;
  const all = sp.days === "all";
  const days = all ? await daysOfViews() : WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 7;
  // What links carry to keep the window: "all" stays all as the days go by.
  const param = all ? "all" : String(days);
  const cut = { area: typeof sp.area === "string" && sp.area ? (sp.area as Area) : undefined, day: typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : undefined };
  const [r, money] = await Promise.all([activityReport(days, cut), moneyReport(days)]);
  const maxArea = Math.max(...r.byArea.map((a) => a.views), 1);
  const maxDay = Math.max(...r.byDay.map((d) => d.views), 1);
  // Every day in the window, oldest first, a quiet day as nought, for the charts.
  const window = Array.from({ length: days }, (_, i) => new Date(now() - (days - 1 - i) * 86400_000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }));
  const perDay = new Map(r.byDay.map((d) => [d.day, d]));
  const series = (key: "views" | "people", title: string): Series => {
    const points = window.map((date) => ({ date, value: perDay.get(date)?.[key] ?? 0 }));
    return { key, title, format: "count", points, total: points.reduce((a, p) => a + p.value, 0) };
  };
  // A rolling week has no sum worth showing: its figure is the latest week.
  const rolling = (key: "views" | "people", title: string): Series => {
    const points = r.rolling.map((d) => ({ date: d.day, value: d[key] }));
    return { key: `week-${key}`, title, format: "count", points, total: points.at(-1)?.value ?? 0, totalLabel: "this week" };
  };

  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {r.views} page views {all ? "since the first one" : `in the last ${days === 1 ? "day" : `${days} days`}`} from {r.members} signed-in {r.members === 1 ? "member" : "members"} and {r.visitors} {r.visitors === 1 ? "visitor" : "visitors"}. Admin views are not counted.
          </p>
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
          {/*
            Two stacks, each card at its own height: side-by-side pairs stretched the short card to
            match the tall one (6 Oct 2026). On a phone, the left stack then the right.
          */}
          <Fold title="Page views a day" className="mb-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <DayChart s={series("views", "Page views")} />
              <DayChart s={series("people", "People")} />
            </div>
          </Fold>

          {days > 1 && (
            <Fold title="Rolling 7 days" className="mb-4">
              <p className="text-xs text-ink-soft mb-3">Each day is the week ending on it, so race days don&apos;t swing it. People counts each person once across the week.</p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <DayChart s={rolling("views", "Views, last 7 days")} />
                <DayChart s={rolling("people", "People, last 7 days")} />
              </div>
            </Fold>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
            <div className="flex flex-col gap-4 min-w-0">
              <Fold title="Where they go">
                <table className="data-table w-full text-sm">
                  <thead><tr><th>Area</th><th className="text-right">Views</th><th className="text-right">People</th><th></th></tr></thead>
                  <tbody>
                    {r.byArea.map((a) => (
                      <tr key={a.area} className={cut.area === a.area ? "bg-lime-soft" : ""}>
                        <td>{AREA_LABEL[a.area] ?? a.area}</td>
                        <td className="text-right nums">{a.views}</td>
                        <td className="text-right nums"><Link href={`/admin/activity?days=${param}&area=${a.area}`} className="underline decoration-dotted underline-offset-2" title="Who they were">{a.people}</Link></td>
                        <td className="w-44"><Bar n={a.views} max={maxArea} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Fold>
              <Fold title="Races they open">
                <table className="data-table w-full text-sm">
                  <thead><tr><th>Race</th><th className="text-right">Views</th><th className="text-right">People</th></tr></thead>
                  <tbody>
                    {r.topRaces.map((x) => (
                      <tr key={x.key}>
                        <td><Link href={`/racing/${x.date}/${x.meetingId}/${x.raceId}`} className="underline">{raceName(x.meetingId, x.raceId)}</Link> <span className="text-ink-soft text-xs">{x.date}</span></td>
                        <td className="text-right nums">{x.views}</td>
                        <td className="text-right nums">{x.people}</td>
                      </tr>
                    ))}
                    {r.topRaces.length === 0 && <tr><td colSpan={3} className="text-ink-soft">No race page opened.</td></tr>}
                  </tbody>
                </table>
              </Fold>
              {r.sources.length > 0 && (
                <Fold title="Where they came from">
                  <p className="text-xs text-ink-soft mb-3">People by their first visit in the window. Ads are counted from 26 Sep 2026, when the tracker began keeping the campaign.</p>
                  <table className="data-table w-full text-sm">
                    <thead><tr><th>Source</th><th className="text-right">People</th></tr></thead>
                    <tbody>{r.sources.map((x) => <tr key={x.source}><td className={x.source.endsWith(" ads") ? "font-semibold" : ""}>{x.source}</td><td className="text-right nums">{x.people}</td></tr>)}</tbody>
                  </table>
                </Fold>
              )}
              <PlanClicks r={money} />
            </div>
            <div className="flex flex-col gap-4 min-w-0">
              <Fold title="By day">
                <table className="data-table w-full text-sm">
                  <thead><tr><th>Day</th><th className="text-right">Views</th><th className="text-right">People</th><th className="text-right" title="People who landed from an ad that day, returning visitors too, as the Money tab counts them">From ads</th><th></th></tr></thead>
                  <tbody>
                    {r.byDay.map((d) => (
                      <tr key={d.day} className={cut.day === d.day ? "bg-lime-soft" : ""}>
                        <td>{dayLabel(d.day)}</td>
                        <td className="text-right nums">{d.views}</td>
                        <td className="text-right nums"><Link href={`/admin/activity?days=${param}&day=${d.day}`} className="underline decoration-dotted underline-offset-2" title="Who they were">{d.people}</Link></td>
                        <td className={`text-right nums ${d.ads ? "font-semibold" : "text-ink-soft"}`}>{d.ads || "—"}</td>
                        <td className="w-44"><Bar n={d.views} max={maxDay} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Fold>
              <Fold title="Tipsters they look at">
                <table className="data-table w-full text-sm">
                  <thead><tr><th>Tipster</th><th className="text-right">Views</th><th className="text-right">People</th></tr></thead>
                  <tbody>
                    {r.topTipsters.map((x) => (
                      <tr key={x.code}><td>{x.code}</td><td className="text-right nums">{x.views}</td><td className="text-right nums">{x.people}</td></tr>
                    ))}
                    {r.topTipsters.length === 0 && <tr><td colSpan={3} className="text-ink-soft">No tipster page opened.</td></tr>}
                  </tbody>
                </table>
              </Fold>
              <Fold id="follows" title="Followers by tipster">
                {r.follows.length === 0 && <p className="text-sm text-ink-soft">Nobody follows a tipster yet.</p>}
                {Object.entries(
                  r.follows.reduce<Record<string, typeof r.follows>>((acc, f) => {
                    (acc[f.tipster] ??= []).push(f);
                    return acc;
                  }, {}),
                )
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([tipster, list]) => (
                    <details key={tipster} className="group border-b border-line py-2">
                      <summary className="cursor-pointer flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold"><span className="inline-block w-4 text-ink-soft group-open:rotate-90 transition-transform">›</span> {tipster}{list[0]?.tipsterCode && <Link href={`/t/${list[0].tipsterCode}`} className="ml-2 text-xs font-normal underline text-ink-soft">their page</Link>}</span>
                        <span className="nums">{list.length} {list.length === 1 ? "follower" : "followers"}</span>
                      </summary>
                      <ul className="mt-2 ml-4 space-y-1 text-sm">
                        {list.map((f, i) => (
                          <li key={i} className="flex justify-between gap-3"><span>{f.followerId ? <Link href={`/admin/${f.followerId}`} className="underline">{f.follower}</Link> : f.follower}</span><span className="text-ink-soft text-xs">{when(f.since)}</span></li>
                        ))}
                      </ul>
                    </details>
                  ))}
              </Fold>
              <BookieClicks r={money} />
            </div>
          </div>

          <Fold className="mt-4 overflow-x-auto" title={r.cut?.area ? `The ${r.people.length} who looked at ${(AREA_LABEL[r.cut.area] ?? r.cut.area).toLowerCase()}` : r.cut?.day ? `The ${r.people.length} on ${dayLabel(r.cut.day)}` : "Most active"}>
            <p className="text-xs text-ink-soft mb-3">
              Members by email. A visitor is a browser we have seen but no account: the number is its cookie, the source is where its first view in the window came from. {r.cut ? <Link href={`/admin/activity?days=${param}`} className="underline">Back to everyone</Link> : "Click a people count above for that cut."}
            </p>
            <table className="data-table stack-sm w-full text-sm whitespace-nowrap">
              <thead><tr><th>Who</th><th>From</th><th className="text-right">Views</th><th className="text-right">Races opened</th><th>Mostly</th><th>Last seen</th></tr></thead>
              <tbody>
                {r.people.map((p) => (
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
          </Fold>
        </>
      )}
    </>
  );
}
