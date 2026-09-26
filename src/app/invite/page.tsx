import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ShareInvite } from "@/components/ShareInvite";
import { getViewer } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { longDate } from "@/lib/format";
import { BONUS_DAYS, ensureReferralCode, referralCount } from "@/lib/referrals";

export const metadata: Metadata = {
  title: "Invite a friend",
  description: "Give a mate three weeks of The Overlay free and get a fortnight yourself.",
  robots: { index: false },
};

export default function Page() {
  return (
    <div className="page max-w-3xl">
      <Suspense fallback={<div className="skeleton h-64 mt-6" />}>
        <Invite />
      </Suspense>
    </div>
  );
}

/** What a friend gets free: the trial and the fortnight together. */
const WEEKS = Math.round((TRIAL_DAYS + BONUS_DAYS) / 7);

async function Invite() {
  const viewer = await getViewer();
  if (!viewer.id) redirect("/login?next=/invite");
  const [code, count] = await Promise.all([viewer.referralCode ?? ensureReferralCode(viewer.id), referralCount(viewer.id)]);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
  const link = `${site}/join/${code}`;
  const message = `I use The Overlay for the races: every runner rated and priced against the market, with the bets and lays marked. Sign up with my link and you get ${WEEKS} weeks free.`;
  const earned = count * BONUS_DAYS;

  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
          Give a mate {WEEKS} weeks free. <span className="bg-lime px-2 box-decoration-clone">Get a fortnight yourself.</span>
        </h1>
        <p className="mt-3 text-ink-secondary max-w-2xl">
          When a friend joins on your link and starts a plan, the full board opens to both of you for {BONUS_DAYS} days. Theirs sits on top
          of the {TRIAL_DAYS}-day trial, yours on top of whatever you already have. No card is charged for either of you.
        </p>
      </section>

      <div className="card">
        <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Your invite link</div>
        <ShareInvite link={link} message={message} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Step n={1} title="Send the link">
          Text it, drop it in the group chat, or share it from your phone.
        </Step>
        <Step n={2} title="They start a plan">
          Any plan, on the free trial. Nothing is charged for {TRIAL_DAYS} days and they can cancel in a click.
        </Step>
        <Step n={3} title={`You both get ${BONUS_DAYS} days`}>
          The moment they start, every meeting on every race day is open to both of you for a fortnight.
        </Step>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card">
          <h2 className="font-display font-extrabold">What they get</h2>
          <ul className="mt-2 text-sm text-ink-secondary space-y-1.5">
            <li>Every runner rated on the clock and the sectionals, with a rated price against the market.</li>
            <li>Our top four in every race, and the bet and lay calls with the edge on each.</li>
            <li>The Datahub: every jockey, trainer, track and trip measured against the market.</li>
            <li>The tipsters&apos; calls, settled to the cent, and the Discord.</li>
          </ul>
        </div>
        <div className="card">
          <h2 className="font-display font-extrabold">What you get</h2>
          <ul className="mt-2 text-sm text-ink-secondary space-y-1.5">
            <li>A fortnight of the full board for every friend who starts: every race day, not only the days your plan covers.</li>
            <li>It stacks. Three mates is six weeks on us.</li>
            <li>An email the moment each one starts, with the date your access now runs to.</li>
            <li>Someone to argue the overlays with on a Saturday.</li>
          </ul>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="card text-center">
          <div className="font-display text-3xl font-extrabold nums">{count}</div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{count === 1 ? "friend started" : "friends started"}</div>
        </div>
        <div className="card text-center">
          <div className="font-display text-3xl font-extrabold nums">{earned}</div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">days earned</div>
        </div>
        <div className="card text-center">
          <div className="font-display text-xl font-extrabold">{viewer.bonusLive ? longDate(viewer.bonusUntil!.slice(0, 10)) : "None running"}</div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">gifted access until</div>
        </div>
      </div>

      <p className="mt-6 text-xs text-ink-soft">
        A friend counts once they start a plan, not on sign-up alone. Gifted days open every race day while they run, then your own plan
        carries on as before. See <Link href="/pricing" className="underline">the plans</Link>.
      </p>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <span className="badge badge-prime nums">{n}</span>
        <h2 className="font-display font-extrabold">{title}</h2>
      </div>
      <p className="mt-2 text-sm text-ink-secondary">{children}</p>
    </div>
  );
}
