import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CopyLink } from "@/components/CopyLink";
import { getViewer } from "@/lib/auth";
import { longDate } from "@/lib/format";
import { BONUS_DAYS, ensureReferralCode, referralCount } from "@/lib/referrals";

export const metadata: Metadata = {
  title: "Invite a friend",
  description: "Share your link and you both get two weeks of the full board.",
  robots: { index: false },
};

export default function Page() {
  return (
    <div className="page max-w-2xl">
      <Suspense fallback={<div className="skeleton h-64 mt-6" />}>
        <Invite />
      </Suspense>
    </div>
  );
}

async function Invite() {
  const viewer = await getViewer();
  if (!viewer.id) redirect("/login?next=/invite");
  const [code, count] = await Promise.all([viewer.referralCode ?? ensureReferralCode(viewer.id), referralCount(viewer.id)]);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
  const link = `${site}/join/${code}`;

  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
          Invite a friend, <span className="bg-lime px-2 box-decoration-clone">you both get two weeks.</span>
        </h1>
        <p className="mt-3 text-ink-secondary">
          Send your link, and when a friend signs up with it and starts a plan you each get {BONUS_DAYS} days of the
          full board, every race day, on top of anything you already have.
        </p>
      </section>

      <div className="card">
        <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Your invite link</div>
        <CopyLink link={link} />
        <p className="mt-2 text-xs text-ink-soft">Every friend who starts a plan adds another fortnight for both of you.</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="card text-center">
          <div className="font-display text-3xl font-extrabold nums">{count}</div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">
            {count === 1 ? "friend joined" : "friends joined"}
          </div>
        </div>
        <div className="card text-center">
          <div className="font-display text-xl font-extrabold">
            {viewer.bonusLive ? longDate(viewer.bonusUntil!.slice(0, 10)) : "None running"}
          </div>
          <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">gifted access until</div>
        </div>
      </div>
    </>
  );
}
