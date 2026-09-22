import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { HotAndNot } from "@/components/HotAndNot";
import { Section } from "@/components/Section";
import { TipsterCallTable } from "@/components/TipsterCallTable";
import { TipsterHead, TipsterRow } from "@/components/TipsterRow";
import { getViewer } from "@/lib/auth";
import Link from "next/link";

import { allTipsters, callsOn, followedTipsters, rankProfiles, TIPSTER_PERIODS, tipsterPeriod, tipsterProfiles } from "@/lib/creators";
import { getTodayCard } from "@/lib/model/source";

export const metadata: Metadata = {
  title: "Tipsters",
  description: "Every tipster on The Overlay ranked by their record, every call they post, and why you would follow each one.",
  alternates: { canonical: "/tipsters" },
};

export default function Page({ searchParams }: PageProps<"/tipsters">) {
  return (
    <div className="page max-w-5xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Marketplace searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * The marketplace: every tipster who has posted, one row each, ranked on
 * their record with the numbers that say why you would follow them; a row
 * opens their page with every call. Under it, who is hot and who is not
 * over the last week. Nothing is hidden behind a follow: a follow puts
 * their calls next to the model's on the race pages.
 */
async function Marketplace({ searchParams }: { searchParams: PageProps<"/tipsters">["searchParams"] }) {
  await connection();
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  // The window the leaderboard ranks on, from ?period=7|30|90|all.
  const period = tipsterPeriod(sp.period);
  const [tipsters, following, { date, meetings, builtAt }] = await Promise.all([allTipsters(), followedTipsters(viewer), getTodayCard(viewer.admin)]);
  const followingIds = new Set(following.map((t) => t.id));
  const [profiles, posted] = await Promise.all([tipsterProfiles(tipsters), callsOn(date, tipsters)]);
  // A tipster who has never posted is not on the board.
  const ranked = rankProfiles(profiles.filter((p) => p.posted > 0), period);
  // Today's calls in jump order across every track, not race number within each.
  const jumps = new Map(meetings.flatMap((m) => m.races.map((r) => [r.raceId, r.jumpTime ?? ""] as const)));
  const today = [...posted].sort((a, b) => (jumps.get(a.race_id) ?? "").localeCompare(jumps.get(b.race_id) ?? "") || a.race_number - b.race_number);
  // A call is live until its race jumps; the card's build stamp is the clock, as on the account page.
  const now = new Date(builtAt).getTime() || 0;
  const isLive = (t: (typeof today)[number]) => !t.settled_at && new Date(jumps.get(t.race_id) || 0).getTime() > now;
  const followed = ranked.filter((p) => followingIds.has(p.tipster.id));

  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">Tipsters</h1>
        <p className="mt-2 text-ink-secondary max-w-2xl">
          Punters who post their own calls here, every one settled at the price they posted, wins and losses. Read the record, read the reasons, follow the ones you rate and their calls sit next to the model&apos;s on every race.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="badge badge-muted">{ranked.length} tipsters</span>
          <span className="badge badge-muted">{today.length} {today.length === 1 ? "call" : "calls"} today</span>
          {followed.length > 0 && <span className="badge badge-prime">You follow {followed.map((p) => p.tipster.name).join(", ")}</span>}
        </div>
      </section>

      <Section
        id="leaderboard"
        letter="1"
        title="Leaderboard"
        controls={
          <div className="metric-tabs" role="tablist">
            {TIPSTER_PERIODS.map((w) => (
              <Link key={w.id} href={w.id === "all" ? "/tipsters" : `/tipsters?period=${w.id}`} role="tab" aria-selected={period === w.id} className="metric-tab" scroll={false}>
                {w.label}
              </Link>
            ))}
          </div>
        }
        aside={period === "all" ? "Ranked all time" : `Ranked on the last ${TIPSTER_PERIODS.find((w) => w.id === period)?.label}, then all time`}
      >
        <div className="section-body">
          {ranked.length === 0 ? (
            <p className="text-sm text-ink-soft">No tipsters have posted yet.</p>
          ) : (
            <table className="data-table tipster-table">
              <TipsterHead period={period} />
              <tbody>
                {ranked.map((p, i) => (
                  <TipsterRow
                    key={p.tipster.id}
                    p={p}
                    rank={i + 1}
                    following={followingIds.has(p.tipster.id)}
                    you={p.tipster.user_id === viewer.id}
                    today={today.filter((t) => t.affiliate_id === p.tipster.id).length}
                    live={today.filter((t) => t.affiliate_id === p.tipster.id && isLive(t)).length}
                    period={period}
                  />
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-ink-soft">Click a tipster for every call they have posted, today&apos;s and before.</p>
        </div>
      </Section>

      {/* Every call posted for the day, across every tipster, in jump order: the one place to see them all. */}
      <div className="mt-4">
        <Section id="today" letter="T" title="Today's calls" aside={today.length ? `${today.length} ${today.length === 1 ? "call" : "calls"} from ${new Set(today.map((t) => t.affiliate_id)).size} ${new Set(today.map((t) => t.affiliate_id)).size === 1 ? "tipster" : "tipsters"}${today.filter(isLive).length ? `, ${today.filter(isLive).length} still to run` : ""}` : "Nothing posted yet"}>
          {today.length === 0 ? (
            <div className="section-body"><p className="text-sm text-ink-soft">No tipster has posted a call today. Calls land here as they are posted, and on your race pages for the tipsters you follow.</p></div>
          ) : (
            <>
              <TipsterCallTable tips={today} jumps={new Map([...jumps].map(([k, v]) => [k, v || undefined]))} />
              <p className="px-4 py-2 text-xs text-ink-soft border-t border-line">Their own calls at their own prices, settled the same way as the model&apos;s. Follow a tipster and their calls sit on your race pages and the tips page.</p>
            </>
          )}
        </Section>
      </div>

      <HotAndNot profiles={ranked} since={new Date(now - 7 * 86400_000).toISOString().slice(0, 10)} className="mt-4" />

      <p className="mt-8 text-xs text-ink-soft max-w-2xl">
        Tipsters&apos; calls are their own and settle at the price and units they post. They are shown separately from the model and never counted in its record.
        Want to post on The Overlay? Email <a href="mailto:hello@theoverlay.com.au" className="text-blue">hello@theoverlay.com.au</a>.
      </p>
    </>
  );
}
