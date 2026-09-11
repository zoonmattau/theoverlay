import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/(auth)/actions";
import { PortalButton } from "@/components/PortalButton";
import { getViewer } from "@/lib/auth";
import { planById } from "@/lib/billing/plans";
import { longDate } from "@/lib/format";

export const metadata: Metadata = { title: "Account" };

export default function Page({ searchParams }: PageProps<"/account">) {
  return (
    <div className="page max-w-2xl">
      <h1 className="font-display text-3xl font-extrabold tracking-tight mt-6">Account</h1>
      <Suspense fallback={<div className="skeleton h-40 mt-6" />}>
        <Details searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Details({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const plan = planById(viewer.plan);

  return (
    <div className="mt-6 space-y-4">
      {sp.password === "updated" && (
        <div className="card border-lime bg-lime-soft">
          <p className="font-semibold">Password updated.</p>
        </div>
      )}
      {(sp.checkout === "success" || sp.checkout === "passes") && (
        <div className="card border-lime bg-lime-soft">
          <p className="font-semibold">
            {sp.checkout === "passes" ? "Passes bought." : "You are in."} Your account updates within a few seconds, refresh if it has not.
          </p>
        </div>
      )}

      <div className="card">
        <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Signed in as</div>
        <div className="mt-1 font-semibold">{viewer.email ?? "—"}</div>
      </div>

      <div className="card">
        <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Subscription</div>
        {viewer.pro ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="badge badge-prime">{plan?.name ?? viewer.plan ?? "Active"}</span>
              {viewer.accessUntil && (
                <span className="text-sm text-ink-secondary">
                  renews {longDate(viewer.accessUntil.slice(0, 10))}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-ink-secondary">
              {plan?.days.length ? `Opens ${plan.name} race days.` : "Opens every race day."}
            </p>
            {viewer.stripeCustomerId && (
              <div className="mt-4 flex flex-wrap gap-2">
                <PortalButton />
                <Link href="/pricing" className="btn btn-secondary">Change plan</Link>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-secondary">No subscription. The board is free, the tips need one.</p>
            <Link href="/pricing" className="btn btn-primary mt-4">See plans</Link>
          </>
        )}
      </div>

      <div className="card">
        <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold">Day passes</div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="font-display text-2xl font-extrabold nums">{viewer.passCredits}</span>
          <span className="text-sm text-ink-secondary">{viewer.passCredits === 1 ? "pass" : "passes"} unused</span>
          <Link href="/pricing" className="btn btn-secondary btn-sm ml-auto">Buy passes</Link>
        </div>
        {viewer.passDates.length > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            Used on {viewer.passDates.slice(0, 5).map((d) => longDate(d)).join(", ")}
            {viewer.passDates.length > 5 ? " and more" : ""}.
          </p>
        )}
      </div>

      <form action={signOut}>
        <button type="submit" className="btn btn-secondary">Log out</button>
      </form>
    </div>
  );
}
