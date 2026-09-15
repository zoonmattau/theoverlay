import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { postTip, removeTip, saveBlurb } from "./actions";
import { CopyLink } from "@/components/CopyLink";
import { TipsterMatrix, type MatrixMeeting } from "@/components/TipsterMatrix";
import { getViewer } from "@/lib/auth";
import { planById } from "@/lib/billing/plans";
import { creatorTips, priceFlagged, tipsterForUser, tipsterMembers, tipsterRecord } from "@/lib/creators";
import { jumpTime, longDate, price } from "@/lib/format";
import { getCard, getTodayCard, racingToday } from "@/lib/model/source";

export const metadata: Metadata = { title: "Your Tips", robots: { index: false } };

/** Posting waits 90 seconds before emailing followers, so the function has to live that long. */
export const maxDuration = 150;

export default function Page({ searchParams }: PageProps<"/tipster">) {
  return (
    <div className="page max-w-5xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Portal searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}u`;

/** yyyy-mm-dd plus one day. */
const nextDay = (date: string) => new Date(new Date(`${date}T12:00:00Z`).getTime() + 86400_000).toISOString().slice(0, 10);

async function Portal({ searchParams }: { searchParams: PageProps<"/tipster">["searchParams"] }) {
  await connection();
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const tipster = await tipsterForUser(viewer.id);
  if (!tipster) {
    return (
      <section className="py-10 max-w-lg">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Your Tips</h1>
        <p className="mt-2 text-ink-secondary">
          {viewer.id ? "This account is not set up as a tipster. If it should be, email " : "Log in with your tipster account to post. Questions go to "}
          <a href="mailto:hello@theoverlay.com.au" className="text-blue">hello@theoverlay.com.au</a>.
        </p>
        {!viewer.id && <Link href="/login?next=/tipster" className="btn btn-primary mt-4">Log in</Link>}
      </section>
    );
  }
  // Today, or tomorrow once the evening build has put its card up.
  const today = racingToday();
  const tomorrow = nextDay(today);
  const wantTomorrow = sp.day === "tomorrow";
  const card = wantTomorrow ? await getCard(tomorrow, true) : await getTodayCard(true);
  const date = wantTomorrow ? tomorrow : today;
  const { meetings } = card;
  const [mine, record, { members, clicks30 }] = await Promise.all([creatorTips(tipster.id, date), tipsterRecord(tipster.id), tipsterMembers(tipster.id)]);
  const paying = members.filter((m) => m.paying);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
  // The day as a grid, with what the tipster has on each race.
  const grid: MatrixMeeting[] = meetings.map((m) => ({
    meetingId: m.meetingId,
    track: m.track,
    state: m.state,
    condition: m.trackCondition,
    races: m.races.map((r) => ({
      raceId: r.raceId,
      raceNumber: r.raceNumber,
      name: r.name,
      distance: r.distance,
      className: r.className,
      clock: jumpTime(r.jumpTime),
      resulted: Boolean(r.result?.length),
      jumped: Boolean(r.jumpTime && new Date(r.jumpTime).getTime() < Date.now()),
      runners: r.runners.filter((x) => !x.scratched).map((x) => ({ tab: x.tabNumber, name: x.horseName, price: x.marketPrice })),
      posted: Object.fromEntries(mine.filter((t) => t.race_id === r.raceId).map((t) => [t.tab_number, t.side])),
    })),
  }));
  const toRun = grid.flatMap((m) => m.races).filter((r) => !r.resulted && (viewer.admin || !r.jumped)).length;

  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
          {tipster.name} <span className="badge badge-muted ml-1 nums">{tipster.code}</span>
        </h1>
        <p className="mt-2 text-ink-secondary">
          Post your calls for {longDate(date)}. Your followers see them next to the model&apos;s, and every call settles at the price you post.
        </p>
        <div className="mt-3 flex gap-2">
          <Link href="/tipster" className={`btn btn-sm ${wantTomorrow ? "btn-secondary" : "btn-primary"}`}>Today, {longDate(today)}</Link>
          <Link href="/tipster?day=tomorrow" className={`btn btn-sm ${wantTomorrow ? "btn-primary" : "btn-secondary"}`}>Tomorrow, {longDate(tomorrow)}</Link>
        </div>
        {wantTomorrow && meetings.length === 0 && (
          <p className="mt-2 text-sm text-ink-soft">Tomorrow&apos;s card is built at 9pm. Until then there is nothing to post on.</p>
        )}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat n={mine.length} label="posted today" />
          <Stat n={record.month.n ? units(record.month.units) : "—"} label="last 30 days" sub={record.month.n ? `${record.month.n} calls, ${record.month.hit} landed` : "nothing settled yet"} tone={record.month.units > 0 ? "prime" : record.month.units < 0 ? "lay" : undefined} />
          <Stat n={record.n ? units(record.units) : "—"} label="all time" sub={record.n ? `${record.n} calls, ${record.hit} landed` : "nothing settled yet"} tone={record.units > 0 ? "prime" : record.units < 0 ? "lay" : undefined} />
          <div className="card">
            <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Your link</div>
            <CopyLink link={`${site}/go/${tipster.code}`} />
          </div>
        </div>
      </section>

      <div className="section mb-4">
        <div className="section-bar"><span className="section-letter">M</span><h2>Your members</h2><span className="aside">{clicks30} clicks on your link in the last 30 days</span></div>
        <div className="section-body">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat n={members.length} label="signed up" sub="through your link" />
            <Stat n={paying.length} label="paying now" tone={paying.length ? "prime" : undefined} />
            <Stat n={members.length ? `${Math.round(members.reduce((a, m) => a + m.days, 0) / members.length)}d` : "—"} label="average time on" sub="days since sign-up" />
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-ink-soft">Nobody yet. Share your link and they show up here as they sign up.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase tracking-[0.08em] text-ink-soft"><th className="text-left py-1">Signed up</th><th className="text-left">On for</th><th className="text-left">Status</th></tr></thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1.5 nums">{longDate(m.since)}</td>
                    <td className="nums">{m.days === 0 ? "today" : `${m.days} ${m.days === 1 ? "day" : "days"}`}</td>
                    <td>{m.paying ? <span className="badge badge-prime">{planById(m.plan ?? undefined)?.name ?? "Paying"}</span> : <span className="badge badge-muted">Free</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-ink-soft">Members are listed without names or emails. Commission is worked out on what they pay.</p>
        </div>
      </div>

      {mine.length > 0 && (
        <div className="section mb-4">
          <div className="section-bar"><span className="section-letter">T</span><h2>Today&apos;s calls</h2><span className="aside">{longDate(date)}</span></div>
          <div className="section-body">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase tracking-[0.08em] text-ink-soft"><th className="text-left py-1">Race</th><th className="text-left">Runner</th><th className="text-left">Call</th><th className="text-right">Price</th><th className="text-left pl-3">Why</th><th className="text-right">Result</th><th></th></tr></thead>
              <tbody>
                {mine.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="py-2 nums">{t.track} R{t.race_number}</td>
                    <td className="font-semibold">{t.tab_number}. {t.horse_name}</td>
                    <td><span className={`badge ${t.side === "lay" ? "badge-lay" : "badge-back"}`}>{t.side === "lay" ? "Lay" : "Bet"}</span></td>
                    <td className="text-right nums">
                      {price(Number(t.price))}{t.bookie || t.bookie_price ? <span className="block text-xs text-ink-soft">{t.bookie_price ? price(Number(t.bookie_price)) : ""}{t.bookie ? ` at ${t.bookie}` : ""}</span> : null}
                      {priceFlagged(t) && <span className="block badge badge-warn mt-1" title={`Best price we saw when you posted was ${price(Number(t.market_at_post))}`}>over market</span>}
                    </td>
                    <td className="pl-3 text-ink-secondary text-xs max-w-xs">{t.comment}</td>
                    <td className="text-right">{t.settled_at ? <span className="nums">{units(Number(t.units))}</span> : <span className="text-xs text-ink-soft">to run</span>}</td>
                    <td className="text-right">
                      {!t.settled_at && (
                        <form action={removeTip.bind(null, t.id)}><button className="btn btn-secondary btn-sm" type="submit">Remove</button></form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="section mb-4">
        <div className="section-bar"><span className="section-letter">+</span><h2>Post a call</h2><span className="aside">Races still to run, {toRun}</span></div>
        <div className="section-body">
          {toRun === 0 ? (
            <p className="text-sm text-ink-soft">Nothing left to run today. Tomorrow&apos;s card opens in the morning.</p>
          ) : (
            <TipsterMatrix meetings={grid} date={date} action={postTip} late={viewer.admin} />
          )}
        </div>
      </div>


      <div className="card">
        <h2 className="font-display font-extrabold">About you</h2>
        <p className="text-xs text-ink-soft mt-1">One line under your name wherever your tips show.</p>
        <form action={saveBlurb} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <label className="field flex-1 min-w-[240px]"><span>Blurb</span><input name="blurb" maxLength={200} defaultValue={tipster.blurb ?? ""} className="field-input w-full" placeholder="Sydney form analyst, 12 years on the punt." /></label>
          <button className="btn btn-secondary btn-sm" type="submit">Save</button>
        </form>
      </div>
    </>
  );
}

function Stat({ n, label, sub, tone }: { n: number | string; label: string; sub?: string; tone?: "prime" | "lay" }) {
  const cls = tone === "prime" ? "border-lime bg-lime-soft" : tone === "lay" ? "border-red bg-red-soft" : "";
  return (
    <div className={`card text-center ${cls}`}>
      <div className="font-display text-3xl font-extrabold tracking-tight nums">{n}</div>
      <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{label}</div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
    </div>
  );
}

