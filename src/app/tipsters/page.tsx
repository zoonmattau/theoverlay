import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { CallFeed } from "@/components/CallFeed";
import { TipsterCard, units } from "@/components/TipsterCard";
import { getViewer } from "@/lib/auth";
import { allTipsters, callsOn, followedTipsters, latestResults, rankProfiles, recentCalls, tipsterProfiles } from "@/lib/creators";
import { longDate } from "@/lib/format";
import { getTodayCard } from "@/lib/model/source";

export const metadata: Metadata = {
  title: "Tipsters",
  description: "Every tipster on The Overlay ranked by their record, every call they post, and why you would follow each one.",
  alternates: { canonical: "/tipsters" },
};

export default function Page() {
  return (
    <div className="page max-w-5xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Marketplace />
      </Suspense>
    </div>
  );
}

/**
 * The marketplace: every tipster ranked on their record, with the numbers
 * that say why you would follow them, then every call posted today and the
 * latest results across the lot. Nothing is hidden behind a follow: a
 * follow puts their calls next to the model's on the race pages.
 */
async function Marketplace() {
  await connection();
  const viewer = await getViewer();
  const [tipsters, following, { date, meetings }] = await Promise.all([allTipsters(), followedTipsters(viewer), getTodayCard(viewer.admin)]);
  const followingIds = new Set(following.map((t) => t.id));
  const [profiles, posted, results, recent] = await Promise.all([tipsterProfiles(tipsters), callsOn(date, tipsters), latestResults(tipsters, 20), recentCalls(tipsters, date)]);
  const ranked = rankProfiles(profiles);
  // Today's calls in jump order across every track, not race number within each.
  const jumps = new Map(meetings.flatMap((m) => m.races.map((r) => [r.raceId, r.jumpTime ?? ""] as const)));
  const today = [...posted].sort((a, b) => (jumps.get(a.race_id) ?? "").localeCompare(jumps.get(b.race_id) ?? "") || a.race_number - b.race_number);
  // A call is live until its race jumps.
  const now = Date.now();
  const isLive = (t: (typeof today)[number]) => !t.settled_at && new Date(jumps.get(t.race_id) || 0).getTime() > now;
  const settledToday = today.filter((t) => t.settled_at);
  const dayUnits = settledToday.reduce((a, t) => a + Number(t.units), 0);
  const followed = ranked.filter((p) => followingIds.has(p.tipster.id));

  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">Tipsters</h1>
        <p className="mt-2 text-ink-secondary max-w-2xl">
          Punters who post their own calls here, every one settled at the price they posted, wins and losses. Read the record, read the reasons, follow the ones you rate and their calls sit next to the model&apos;s on every race.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="badge badge-muted">{tipsters.length} tipsters</span>
          <span className="badge badge-muted">{today.length} {today.length === 1 ? "call" : "calls"} today</span>
          {settledToday.length > 0 && <span className={`badge ${dayUnits >= 0 ? "badge-ok" : "badge-warn"}`}>{units(dayUnits)} today so far</span>}
          {followed.length > 0 && <span className="badge badge-prime">You follow {followed.map((p) => p.tipster.name).join(", ")}</span>}
        </div>
      </section>

      <section className="section" id="leaderboard">
        <div className="section-bar">
          <span className="section-letter">1</span>
          <h2>Leaderboard</h2>
          <span className="aside">Ranked on the last 30 days, then all time</span>
        </div>
        <div className="section-body">
          {ranked.length === 0 ? (
            <p className="text-sm text-ink-soft">No tipsters yet.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {ranked.map((p, i) => (
                <TipsterCard
                  key={p.tipster.id}
                  p={p}
                  rank={i + 1}
                  following={followingIds.has(p.tipster.id)}
                  you={p.tipster.user_id === viewer.id}
                  today={today.filter((t) => t.affiliate_id === p.tipster.id)}
                  live={today.filter((t) => t.affiliate_id === p.tipster.id && isLive(t)).length}
                  recent={recent.get(p.tipster.id) ?? []}
                  date={date}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section mt-4" id="today">
        <div className="section-bar">
          <span className="section-letter">T</span>
          <h2>Every call today</h2>
          <span className="aside">{longDate(date)}, in jump order</span>
        </div>
        <div className="section-body">
          <CallFeed tips={today} date={date} empty="Nothing posted yet today. Calls land here the moment a tipster posts one." />
        </div>
      </section>

      <section className="section mt-4" id="results">
        <div className="section-bar">
          <span className="section-letter">R</span>
          <h2>Latest results</h2>
          <span className="aside">The last {results.length} settled calls across every tipster</span>
        </div>
        <div className="section-body">
          <CallFeed tips={results} date={date} empty="Nothing settled yet." withDate />
        </div>
      </section>

      <p className="mt-8 text-xs text-ink-soft max-w-2xl">
        Tipsters&apos; calls are their own and settle at the price they post, one unit a call. They are shown separately from the model and never counted in its record.
        Want to post on The Overlay? Email <a href="mailto:hello@theoverlay.com.au" className="text-blue">hello@theoverlay.com.au</a>.
      </p>
    </>
  );
}
