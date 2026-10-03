import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Record } from "@/components/Record";
import { Section } from "@/components/Section";
import { SheetDay } from "@/components/SheetDay";
import { RESULTS_SHEET } from "@/lib/social";
import { dailyUnits, publicRecord, resultCalls, type ResultCall } from "@/lib/tips";
import { racingToday } from "@/lib/model/source";

export const metadata: Metadata = {
  title: "Results",
  description: "Every call The Overlay has made, won and lost, at level stakes. Bets and lays, day by day.",
  alternates: { canonical: "/results" },
};

const PERIODS = [
  { id: "all", label: "Since launch" },
  { id: "30", label: "30 days" },
  { id: "7", label: "7 days" },
] as const;
const SIDES = [
  { id: "all", label: "All calls" },
  { id: "bets", label: "Bets" },
  { id: "lays", label: "Lays" },
] as const;
/** Days of calls listed before "Show older". */
const DAYS_SHOWN = 7;

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}u`;
const tone = (n: number) => (n > 0 ? "text-accent" : n < 0 ? "text-red" : "text-ink-soft");
const price = (n: number) => `$${Number(n).toFixed(2)}`;
const dayName = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const ordinal = (n: number) => (n === 0 ? "unplaced" : `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function Page({ searchParams }: PageProps<"/results">) {
  return (
    <div className="page max-w-5xl">
      <section className="pt-6 pb-4">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Results</h1>
        <p className="mt-2 text-ink-secondary max-w-2xl">
          Every call we have made, won and lost, settled at level stakes.
        </p>
      </section>
      <Suspense fallback={<div className="skeleton h-96" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/results">["searchParams"] }) {
  const sp = await searchParams;
  const period = PERIODS.find((p) => p.id === one(sp.period))?.id ?? "all";
  const side = SIDES.find((s) => s.id === one(sp.side))?.id ?? "all";
  const older = one(sp.older) === "1";
  const [stats, daily, all] = await Promise.all([publicRecord(racingToday()), dailyUnits(), resultCalls()]);

  const from = period === "all" ? "" : new Date(Date.now() - Number(period) * 86400_000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const calls = all.filter((c) => c.date >= from && (side === "all" || (side === "bets" ? c.side === "back" : c.side === "lay")));
  const byDay = new Map<string, ResultCall[]>();
  for (const c of calls) byDay.set(c.date, [...(byDay.get(c.date) ?? []), c]);
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  // The running total reads oldest to newest, so it ends on the total for the filter.
  let run = 0;
  const totals = new Map<string, number>();
  for (const d of [...days].reverse()) {
    run += byDay.get(d)!.reduce((a, c) => a + Number(c.units), 0);
    totals.set(d, run);
  }
  const net = calls.reduce((a, c) => a + Number(c.units), 0);
  const won = calls.filter((c) => Number(c.units) > 0).length;
  const href = (p: string, s: string, more = false) => {
    const q = new URLSearchParams({ ...(p !== "all" ? { period: p } : {}), ...(s !== "all" ? { side: s } : {}), ...(more ? { older: "1" } : {}) }).toString();
    return q ? `/results?${q}` : "/results";
  };
  const listed = older ? days : days.slice(0, DAYS_SHOWN);

  return (
    <div className="space-y-4">
      <Record stats={stats} daily={daily} full />

      <div className="flex flex-wrap items-center gap-2">
        <div className="metric-tabs" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <Link key={p.id} href={href(p.id, side)} role="tab" aria-selected={period === p.id} className="metric-tab" scroll={false}>
              {p.label}
            </Link>
          ))}
        </div>
        <div className="metric-tabs" role="tablist" aria-label="Calls">
          {SIDES.map((s) => (
            <Link key={s.id} href={href(period, s.id)} role="tab" aria-selected={side === s.id} className="metric-tab" scroll={false}>
              {s.label}
            </Link>
          ))}
        </div>
        <span className="ml-auto text-sm nums">
          <span className={`font-bold ${tone(net)}`}>{units(net)}</span>
          <span className="text-ink-soft">
            {" "}
            from {calls.length.toLocaleString("en-AU")} {calls.length === 1 ? "call" : "calls"}, {calls.length ? Math.round((won / calls.length) * 100) : 0}% won
          </span>
        </span>
      </div>

      <Section id="by-day" letter="D" title="By day" aside={`${days.length} ${days.length === 1 ? "day" : "days"}`}>
        <div className="section-body">
          {days.length === 0 ? (
            <p className="text-sm text-ink-soft">No settled calls in this window.</p>
          ) : (
            <table className="data-table text-sm w-full [&_th]:px-2 [&_td]:px-2">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="text-right">Calls</th>
                  <th className="text-right hidden sm:table-cell">Won</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Running</th>
                </tr>
              </thead>
                <tbody>
                {days.map((d) => {
                  const cs = byDay.get(d)!;
                  const u = cs.reduce((a, c) => a + Number(c.units), 0);
                  return (
                    <tr key={d}>
                      <td className="whitespace-nowrap">
                        <a href={`#day-${d}`} className="hover:text-blue">{dayName(d)}</a>
                      </td>
                      <td className="text-right nums">{cs.length}</td>
                      <td className="text-right nums hidden sm:table-cell">{cs.filter((c) => Number(c.units) > 0).length}</td>
                      <td className={`text-right nums font-semibold ${tone(u)}`}>{units(u)}</td>
                      <td className={`text-right nums ${tone(totals.get(d)!)}`}>{units(totals.get(d)!)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      <Section id="calls" letter="C" title="Every call" aside={older ? `${days.length} days` : `Last ${Math.min(DAYS_SHOWN, days.length)} days`}>
        <div className="p-3 sm:p-4">
          <table className="sheet">
            {listed.map((d) => {
              const cs = byDay.get(d)!;
              const u = cs.reduce((a, c) => a + Number(c.units), 0);
              // Running totals inside the day, counting up to each call from the day before's close.
              let at = (totals.get(d) ?? 0) - u;
              const runs = cs.map((c) => (at += Number(c.units)));
              return (
                <SheetDay
                  key={d}
                  id={`day-${d}`}
                  head={
                    <>
                      <th className="sheet-wide">Race</th>
                      <th>Horse</th>
                      <th>Call</th>
                      <th className="num sheet-wide">Price</th>
                      <th className="num sheet-wide">Finish</th>
                      <th>Result</th>
                      <th className="num">Units</th>
                      <th className="num sheet-wide">Running</th>
                    </>
                  }
                  cells={
                    <>
                      <td className="sheet-wide">
                        <span className="caret" aria-hidden /> {dayName(d)}
                      </td>
                      <td>
                        <span className="sm:hidden">
                          <span className="caret" aria-hidden /> {dayName(d)}
                        </span>
                      </td>
                      <td>{cs.length} {cs.length === 1 ? "call" : "calls"}</td>
                      <td className="sheet-wide" />
                      <td className="sheet-wide" />
                      <td>{cs.filter((c) => Number(c.units) > 0).length} won</td>
                      <td className={`num ${u > 0 ? "pos" : u < 0 ? "neg" : ""}`}>{units(u)}</td>
                      <td className={`num sheet-wide ${totals.get(d)! > 0 ? "pos" : totals.get(d)! < 0 ? "neg" : ""}`}>{units(totals.get(d)!)}</td>
                    </>
                  }
                >
                  {cs.map((c, i) => (
                    <SheetRow key={`${c.race_id}:${c.tab_number}:${c.side}`} c={c} running={runs[i]} />
                  ))}
                </SheetDay>
              );
            })}
          </table>
        </div>
      </Section>

      {!older && days.length > DAYS_SHOWN && (
        <div className="text-center">
          <Link href={href(period, side, true)} className="btn btn-secondary" scroll={false}>
            Show {days.length - DAYS_SHOWN} older {days.length - DAYS_SHOWN === 1 ? "day" : "days"}
          </Link>
        </div>
      )}

      <p className="text-xs text-ink-soft pb-8">
        Level stakes, one unit a call, the stake a call carries where it says so. A lay stakes the unit it wins. Voids (a scratching, a race called off) are left out. The same record is in the{" "}
        <a href={RESULTS_SHEET} className="underline" target="_blank" rel="noopener">
          Google sheet
        </a>{" "}
        and as{" "}
        <a href="/api/results.csv" className="underline">
          CSV
        </a>
        .
      </p>
    </div>
  );
}

/** One call as a spreadsheet row: race, horse, how we called it, price, finish, the result tinted, units and the running total. */
function SheetRow({ c, running }: { c: ResultCall; running: number }) {
  const lay = c.side === "lay";
  const prime = c.tag === "prime_overlay" || c.tag === "top_overlay";
  const stake = c.stake && Number(c.stake) !== 1 ? ` ${Number(c.stake)}u` : "";
  const u = Number(c.units);
  return (
    <tr className="sheet-row">
      <td className="sheet-wide">
        <Link href={`/racing/${c.date}/${encodeURIComponent(c.meeting_id)}/${encodeURIComponent(c.race_id)}`} className="hover:text-blue">
          {c.track} R{c.race_number}
        </Link>
      </td>
      <td className="sheet-horse">
        {/* On a phone the race sits over the horse, the Race column gone. */}
        <Link href={`/racing/${c.date}/${encodeURIComponent(c.meeting_id)}/${encodeURIComponent(c.race_id)}`} className="sm:hidden block text-[0.68rem] text-ink-soft hover:text-blue">
          {c.track} R{c.race_number}
        </Link>
        <span className="text-ink-soft nums">{c.tab_number}.</span> {c.horse_name}
      </td>
      <td>
        {prime ? <span className="call-prime">Prime{stake}</span> : <span className={lay ? "call-lay" : "call-bet"}>{lay ? "Lay" : "Bet"}{stake}</span>}
      </td>
      <td className="num sheet-wide">{price(c.market_price)}</td>
      <td className="num sheet-wide">{c.finish_position === 0 ? "Unpl" : ordinal(c.finish_position)}</td>
      <td className={u > 0 ? "win" : "loss"}>{u > 0 ? (lay ? "Held" : "Won") : lay ? "Lost" : "Lost"}</td>
      <td className={`num ${u > 0 ? "pos" : u < 0 ? "neg" : ""}`}>{units(u)}</td>
      <td className={`num sheet-wide ${running > 0 ? "pos" : running < 0 ? "neg" : ""}`}>{units(running)}</td>
    </tr>
  );
}
