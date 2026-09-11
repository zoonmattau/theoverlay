import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CheckoutButton } from "@/components/CheckoutButton";
import { getViewer } from "@/lib/auth";
import { PASS_BUNDLES, PASS_PRICE, PLANS, TRIAL_DAYS } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Saturday, Saturday plus Wednesday, or every day, all with a 7-day free trial. Or buy day passes and use them when you like.",
};

export default function Page() {
  return (
    <div className="page max-w-5xl">
      <section className="text-center max-w-2xl mx-auto py-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
          Know the price <span className="bg-lime px-2 box-decoration-clone">before you bet.</span>
        </h1>
        <p className="mt-3 text-ink-secondary">
          Every runner rated, every horse priced, and the bets and lays called before the jump. Pick the
          days you bet and try it free for seven days, or buy passes and use them when you like.
        </p>
      </section>

      <Suspense fallback={<div className="skeleton h-96" />}>
        <Plans />
      </Suspense>

      <section className="mt-10 grid gap-3 sm:grid-cols-2 text-sm">
        <div className="card">
          <h2 className="font-display font-extrabold">What you unlock</h2>
          <p className="mt-1 text-ink-secondary">Our top four in every race with the reasons, the bet and lay calls, rankings across eight categories, and the pressure grid.</p>
        </div>
        <div className="card">
          <h2 className="font-display font-extrabold">What stays free</h2>
          <p className="mt-1 text-ink-secondary">The board, jump times, results, the live market and one free race every day.</p>
        </div>
      </section>

      <p className="mt-8 text-xs text-ink-soft text-center">
        Prices in AUD excluding GST, which is added at checkout. Subscriptions renew monthly until cancelled and can be cancelled any time from your account. Day passes do not expire. 18+ only, gamble responsibly.{" "}
        <Link href="/terms" className="underline">Terms</Link>.
      </p>
    </div>
  );
}

async function Plans() {
  const viewer = await getViewer();
  const signedIn = Boolean(viewer.id);

  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-display text-lg font-extrabold">Subscriptions</h2>
        <span className="badge badge-prime">{TRIAL_DAYS}-day free trial</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3 items-stretch">
        {PLANS.map((p) => (
          <article key={p.id} className={`pick-card ${p.highlight ? "is-top" : ""}`}>
            {p.highlight && <span className="badge badge-prime self-start">Most popular</span>}
            <div>
              <h3 className="font-display text-xl font-extrabold">{p.name}</h3>
              <p className="text-sm text-ink-soft">{p.blurb}</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-display text-4xl font-extrabold tracking-tight nums">${p.price}</span>
              <span className="text-sm text-ink-soft">per month</span>
            </div>
            <ul className="space-y-1.5 text-sm text-ink-secondary flex-1">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-accent font-bold">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {viewer.pro && viewer.plan === p.id ? (
              <Link href="/account" className="btn btn-secondary w-full">Your plan</Link>
            ) : (
              <CheckoutButton
                plan={p.id}
                signedIn={signedIn}
                label={viewer.pro ? "Switch to this plan" : `Try free for ${TRIAL_DAYS} days`}
                className={`btn w-full ${p.highlight ? "btn-primary" : "btn-secondary"}`}
              />
            )}
          </article>
        ))}
      </div>

      <div className="mt-10 flex items-center gap-3 mb-3">
        <h2 className="font-display text-lg font-extrabold">Day passes</h2>
        <span className="text-sm text-ink-soft">${PASS_PRICE} a day, cheaper in a bundle, use them whenever you like</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PASS_BUNDLES.map((b) => {
          const each = b.price / b.qty;
          const saving = Math.round((1 - each / PASS_PRICE) * 100);
          return (
            <article key={b.qty} className="pick-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-xl font-extrabold">
                    {b.qty} {b.qty === 1 ? "pass" : "passes"}
                  </h3>
                  <p className="text-sm text-ink-soft nums">${each.toFixed(2)} a day</p>
                </div>
                {saving > 0 && <span className="badge badge-back">Save {saving}%</span>}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-display text-3xl font-extrabold tracking-tight nums">${b.price}</span>
                <span className="text-sm text-ink-soft">one-off</span>
              </div>
              <CheckoutButton
                passes={b.qty}
                signedIn={signedIn}
                label={`Buy ${b.qty === 1 ? "a pass" : `${b.qty} passes`}`}
                className="btn btn-secondary w-full"
              />
            </article>
          );
        })}
      </div>
    </>
  );
}
