import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { getCardFor, racingToday } from "@/lib/model/source";
import { readMutes } from "@/lib/model/store";
import { setCallOff } from "@/app/admin/actions";
import { CallOffButton } from "@/components/CallOffButton";
import { jumpTime, longDate, price } from "@/lib/format";

export const metadata = { title: "Calls taken off", robots: { index: false } };

/**
 * Every call taken off today's card by hand, and the way to put one back.
 * A call taken off stays off for every rebuild of the day; tomorrow's card
 * is decided by the numbers again.
 */
export default function Page() {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Off />
      </Suspense>
    </div>
  );
}

async function Off() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const date = racingToday();
  const [off, card] = await Promise.all([readMutes(date).catch(() => new Set<string>()), getCardFor(date, true)]);

  // The runners those keys point at, so the list reads as races and horses.
  interface Row { key: string; raceId: string; tab: number; meetingId: string; track: string; raceNumber: number; clock: string; horse: string; market?: number; rated?: number }
  const rows: Row[] = [...off].flatMap<Row>((key) => {
    const [raceId, tab] = [key.slice(0, key.lastIndexOf(":")), Number(key.slice(key.lastIndexOf(":") + 1))];
    for (const m of card.meetings) {
      for (const r of m.races) {
        if (r.raceId !== raceId) continue;
        const x = r.runners.find((y) => y.tabNumber === tab);
        if (x) return [{ key, raceId, tab, meetingId: m.meetingId, track: m.track, raceNumber: r.raceNumber, clock: jumpTime(r.jumpTime), horse: x.horseName, market: x.marketPrice, rated: x.ratedPrice }];
      }
    }
    return [{ key, raceId, tab, meetingId: "", track: "not on today's card", raceNumber: 0, clock: "", horse: `runner ${tab}`, market: undefined, rated: undefined }];
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Calls taken off</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {longDate(date)}. A call taken off stays off for every rebuild of the day. Tomorrow the numbers decide again.
        </p>
      </header>

      <div className="card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">Nothing taken off today. Open a runner on a race page, or use the chip in Today&apos;s tips.</p>
        ) : (
          <table className="data-table text-sm">
            <thead>
              <tr>
                <th>Race</th>
                <th>Runner</th>
                <th className="text-right">Live</th>
                <th className="text-right">Rated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="whitespace-nowrap">
                    {r.meetingId ? (
                      <Link href={`/racing/${date}/${r.meetingId}/${encodeURIComponent(r.raceId)}`} className="font-semibold hover:text-blue">
                        {r.track} R{r.raceNumber}
                      </Link>
                    ) : (
                      <span className="text-ink-soft">{r.track}</span>
                    )}
                    {r.clock ? <span className="nums text-ink-soft"> {r.clock}</span> : null}
                  </td>
                  <td className="font-semibold">{r.tab}. {r.horse}</td>
                  <td className="text-right nums">{price(r.market)}</td>
                  <td className="text-right nums">{price(r.rated)}</td>
                  <td className="text-right">
                    <CallOffButton date={date} raceId={r.raceId} tab={r.tab} horse={r.horse} side="lay" off setOff={setCallOff} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
