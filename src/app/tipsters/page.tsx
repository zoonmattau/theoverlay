import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { FollowButton } from "@/components/FollowButton";
import { SocialLinks } from "@/components/SocialLinks";
import { TipsterTips } from "@/components/TipsterTips";
import { getViewer } from "@/lib/auth";
import { allTipsters, creatorTips, followedTipsters, tipsterCallCounts, tipsterRecord } from "@/lib/creators";
import { getTodayCard } from "@/lib/model/source";

export const metadata: Metadata = {
  title: "Tipsters",
  description: "The tipsters on The Overlay, their records and today's calls. Follow one and their tips sit next to the model's.",
  alternates: { canonical: "/tipsters" },
};

export default function Page() {
  return (
    <div className="page max-w-4xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Directory />
      </Suspense>
    </div>
  );
}

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}u`;

/** Every tipster on the site, with their record and a follow button. */
async function Directory() {
  await connection();
  const viewer = await getViewer();
  const [tipsters, following, { date }] = await Promise.all([allTipsters(), followedTipsters(viewer), getTodayCard(viewer.admin)]);
  const followingIds = new Set(following.map((t) => t.id));
  const [records, counts, followedTips] = await Promise.all([
    Promise.all(tipsters.map((t) => tipsterRecord(t.id))),
    tipsterCallCounts(date),
    Promise.all(following.map((t) => creatorTips(t.id, date))),
  ]);

  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">Tipsters</h1>
        <p className="mt-2 text-ink-secondary max-w-2xl">
          People who post their own calls on The Overlay. Follow one and their tips show next to the model&apos;s on every race, settled the same way, wins and losses.
        </p>
      </section>

      {following.map((t, i) => (
        <div key={t.id} className="mb-6">
          <TipsterTips tipster={t} tips={followedTips[i]} record={records[tipsters.findIndex((x) => x.id === t.id)]} date={date} />
        </div>
      ))}

      {tipsters.length === 0 ? (
        <p className="text-sm text-ink-soft">No tipsters yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tipsters.map((t, i) => {
            const r = records[i];
            const today = counts.get(t.id) ?? 0;
            const isFollowing = followingIds.has(t.id);
            return (
              <div key={t.id} className={`card flex flex-col gap-3 ${isFollowing ? "border-lime" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/t/${t.code}`} className="font-display text-xl font-extrabold tracking-tight hover:underline">{t.name}</Link>
                    <SocialLinks instagram={t.instagram} twitter={t.twitter} tiktok={t.tiktok} className="mt-0.5" />
                    {t.blurb && <p className="text-sm text-ink-secondary mt-0.5">{t.blurb}</p>}
                  </div>
                  {t.user_id === viewer.id ? <span className="badge badge-prime">You</span> : <FollowButton code={t.code} following={isFollowing} small />}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat n={r.month.n ? units(r.month.units) : "—"} label="30 days" sub={r.month.n ? `${r.month.n} calls, ${r.month.hit} landed` : "no settled calls"} tone={r.month.units > 0 ? "up" : r.month.units < 0 ? "down" : undefined} />
                  <Stat n={r.n ? units(r.units) : "—"} label="all time" sub={r.n ? `${r.n} calls, ${r.hit} landed` : "no settled calls"} tone={r.units > 0 ? "up" : r.units < 0 ? "down" : undefined} />
                  <Stat n={today} label="calls today" sub={today ? "see their page" : "none posted yet"} />
                </div>
                <Link href={`/t/${t.code}`} className="text-sm text-blue">Today&apos;s calls and record →</Link>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-ink-soft max-w-2xl">
        Tipsters&apos; calls are their own and settle at the price they post, one unit a call. They are shown separately from the model and never counted in its record.
        Want to post on The Overlay? Email <a href="mailto:hello@theoverlay.com.au" className="text-blue">hello@theoverlay.com.au</a>.
      </p>
    </>
  );
}

function Stat({ n, label, sub, tone }: { n: number | string; label: string; sub?: string; tone?: "up" | "down" }) {
  const cls = tone === "up" ? "border-lime bg-lime-soft" : tone === "down" ? "border-red bg-red-soft" : "";
  return (
    <div className={`stat text-center ${cls}`}>
      <div className="font-display text-xl font-extrabold tracking-tight nums">{n}</div>
      <div className="stat-label mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-ink-soft mt-0.5">{sub}</div>}
    </div>
  );
}
