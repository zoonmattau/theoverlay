import type { Metadata } from "next";
import { publishedDates } from "@/lib/reviews";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { canReview, isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { listStoredDates } from "@/lib/model/store";
import { callsStatus, reviewedDates } from "@/lib/model/review";
import { racingToday } from "@/lib/model/source";
import { AllCallsButton } from "./AllCallsButton";

export const metadata: Metadata = { title: "Weekly review", robots: { index: false } };

export default function Page() {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Index />
      </Suspense>
    </div>
  );
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const label = (date: string) => new Date(`${date}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
const dayOf = (date: string) => DAY[new Date(`${date}T12:00:00+10:00`).getDay()];

async function Index() {
  const viewer = await getViewer();
  if (!(await canReview(viewer))) notFound();
  const admin = isAdmin(viewer);
  const [dates, reviewed, publishedRows] = await Promise.all([listStoredDates(120), reviewedDates(), publishedDates()]);
  const published = new Set(publishedRows);
  const today = racingToday();
  // Every day on file: the calls are reviewed all week, the full field on Saturdays.
  const status = await callsStatus(dates);
  const calls = new Map(status.map((c) => [c.date, c]));
  // Today's races are still running, so its calls wait until tomorrow.
  const toBuy = status.filter((c) => c.date < today);
  const owed = toBuy.reduce((a, c) => a + (c.calls - c.fetched), 0);
  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Weekly review</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {admin
              ? "Every bet and lay against its run, all week; each Saturday, every NSW and VIC runner too. Open a day to fetch the runs."
              : "Every run timed against its class, with the sectionals: our bets and lays all week, and every NSW and VIC runner on a Saturday. NSW, VIC and WA are in by Monday, QLD and SA later in the week."}
          </p>
        </div>
        {admin && <AllCallsButton dates={toBuy.filter((c) => c.calls > c.fetched).map((c) => c.date)} toBuy={owed} />}
      </section>
      <div className="card overflow-x-auto">
        <table className="data-table stack-sm w-full">
          <thead>
            <tr><th>Day</th><th>Date</th>{admin && <th className="text-right">Calls with runs</th>}<th className="text-right">Runs in</th>{admin && <th>Review</th>}<th>Public</th></tr>
          </thead>
          <tbody>
            {dates.map((d) => {
              const c = calls.get(d);
              return (
                <tr key={d} className={dayOf(d) === "Saturday" ? "font-semibold" : ""}>
                  <td>{dayOf(d)}<span className="stack-only"> <Link href={`/admin/review/${d}`} className="underline">{label(d)}</Link></span></td>
                  <td className="stack-hide"><Link href={`/admin/review/${d}`} className="font-semibold underline">{label(d)}</Link></td>
                  {admin && <td data-label="Calls with runs" className={`text-right nums ${c && c.calls > c.fetched && d < today ? "text-red-700" : ""}`}>{c ? `${c.fetched}/${c.calls}` : ""}</td>}
                  <td data-label="Runs in" className="text-right nums">{reviewed.get(d) ?? 0}</td>
                  {admin && <td data-label="Review" className="text-ink-soft font-normal">{reviewed.has(d) ? "Fetched" : "Not yet"}</td>}
                  <td data-label="Public" className="font-normal">{published.has(d) ? <Link href={`/review/${d}`} className="underline">Published</Link> : admin && reviewed.has(d) ? <Link href={`/admin/review/${d}/preview`} className="underline text-ink-soft">Preview</Link> : <span className="text-ink-soft">—</span>}</td>
                </tr>
              );
            })}
            {dates.length === 0 && <tr><td colSpan={admin ? 6 : 4} className="text-ink-soft">No cards on file yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
