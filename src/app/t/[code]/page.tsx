import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { FollowButton } from "@/components/FollowButton";
import { SocialLinks } from "@/components/SocialLinks";
import { TipsterTips } from "@/components/TipsterTips";
import { getViewer } from "@/lib/auth";
import { creatorTips, followedTipsters, tipsterByCode, tipsterRecord } from "@/lib/creators";
import { longDate } from "@/lib/format";
import { getTodayCard } from "@/lib/model/source";

type Props = PageProps<"/t/[code]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const t = await tipsterByCode(code);
  if (!t) return { title: "Tipster not found", robots: { index: false } };
  return { title: `${t.name}'s tips`, description: t.blurb ?? `${t.name}'s racing tips on The Overlay, every call settled.`, alternates: { canonical: `/t/${t.code}` } };
}

export default function Page({ params }: Props) {
  return (
    <div className="page max-w-3xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <TipsterPage params={params} />
      </Suspense>
    </div>
  );
}

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}u`;

/** A tipster's public page: who they are, their record, today's calls. */
async function TipsterPage({ params }: { params: Props["params"] }) {
  await connection();
  const { code } = await params;
  const tipster = await tipsterByCode(code);
  if (!tipster) notFound();
  const viewer = await getViewer();
  const { date } = await getTodayCard(viewer.admin);
  const [tips, record, followingList] = await Promise.all([creatorTips(tipster.id, date), tipsterRecord(tipster.id), followedTipsters(viewer)]);
  const following = followingList.find((t) => t.id === tipster.id);

  return (
    <>
      <section className="py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">{tipster.name}</h1>
            <SocialLinks instagram={tipster.instagram} twitter={tipster.twitter} tiktok={tipster.tiktok} className="mt-1" />
            {tipster.blurb && <p className="mt-2 text-ink-secondary">{tipster.blurb}</p>}
          </div>
          {tipster.user_id === viewer.id ? <Link href="/tipster" className="btn btn-secondary">Post a call</Link> : <FollowButton code={tipster.code} following={following?.id === tipster.id} />}
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          {tipster.user_id === viewer.id ? "This is your page, what your followers see." : following?.id === tipster.id ? `You follow ${tipster.name}: their calls show next to the model's on every race.` : `Follow ${tipster.name} and their calls show next to the model's on every race.`}
          {" "}<Link href="/tipsters" className="text-blue">All tipsters</Link>
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat n={record.month.n ? units(record.month.units) : "—"} label="last 30 days" sub={record.month.n ? `${record.month.n} calls, ${record.month.hit} landed` : "nothing settled yet"} />
          <Stat n={record.n ? units(record.units) : "—"} label="all time" sub={record.n ? `${record.n} calls, ${record.hit} landed` : "nothing settled yet"} />
        </div>
      </section>

      <TipsterTips tipster={tipster} tips={tips} date={date} />

      <div className="card border-lime bg-lime-soft mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm">
          {tipster.name}&apos;s calls sit next to the model&apos;s rated prices for every runner on {longDate(date)}. One race is free every day.
        </span>
        <Link href="/pricing" className="btn btn-primary ml-auto">Start free trial</Link>
      </div>
    </>
  );
}

function Stat({ n, label, sub }: { n: number | string; label: string; sub?: string }) {
  return (
    <div className="card text-center">
      <div className="font-display text-3xl font-extrabold tracking-tight nums">{n}</div>
      <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{label}</div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
    </div>
  );
}
