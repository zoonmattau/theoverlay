import type { Metadata } from "next";
import { publishedDates } from "@/lib/reviews";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { listStoredDates } from "@/lib/model/store";
import { reviewedDates } from "@/lib/model/review";

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
  if (!isAdmin(viewer)) notFound();
  const [dates, reviewed, publishedRows] = await Promise.all([listStoredDates(120), reviewedDates(), publishedDates()]);
  const published = new Set(publishedRows);
  // Saturdays, and any other day that has been reviewed.
  const rows = dates.filter((d) => dayOf(d) === "Saturday" || reviewed.has(d));
  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Weekly review</h1>
        <p className="mt-1 text-sm text-ink-soft">Each Saturday, how every NSW and VIC runner ran against its benchmark, next to the mark we had it at. Open a day to fetch the runs.</p>
      </section>
      <div className="card overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr><th>Day</th><th>Date</th><th className="text-right">Runs fetched</th><th>Review</th><th>Public</th></tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d}>
                <td>{dayOf(d)}</td>
                <td><Link href={`/admin/review/${d}`} className="font-semibold underline">{label(d)}</Link></td>
                <td className="text-right nums">{reviewed.get(d) ?? 0}</td>
                <td className="text-ink-soft">{reviewed.has(d) ? "Fetched" : "Not yet"}</td>
                <td>{published.has(d) ? <Link href={`/review/${d}`} className="underline">Published</Link> : reviewed.has(d) ? <Link href={`/admin/review/${d}/preview`} className="underline text-ink-soft">Preview</Link> : <span className="text-ink-soft">—</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="text-ink-soft">No Saturdays on file yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
