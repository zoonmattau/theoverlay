import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AutoCheckout } from "@/components/AutoCheckout";
import { CheckoutButton } from "@/components/CheckoutButton";
import { FaqList, JsonLd, SITE_URL, faqSchema } from "@/components/JsonLd";
import { PLANS_FAQ } from "@/lib/faq";
import { getViewer } from "@/lib/auth";
import { firstMonthOfferUntil } from "@/lib/billing/first-month";
import { PASS_BUNDLES, PASS_PRICE, PLANS, TRIAL_DAYS, termById, termMonthly, termPrice, termPriceId, weeklyLabel } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Saturday, Saturday plus Wednesday, or every day, all with a 7-day free trial. Or buy day passes and use them when you like.",
  alternates: { canonical: "/pricing" },
};


const PRODUCT = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "The Overlay membership",
  description: "Ratings, rated prices and bet or lay calls for every runner in Australian racing.",
  brand: { "@type": "Brand", name: "The Overlay" },
  url: `${SITE_URL}/pricing`,
  offers: [
    ...PLANS.map((p) => ({
      "@type": "Offer",
      name: `${p.name} plan`,
      price: p.price,
      priceCurrency: "AUD",
      priceSpecification: { "@type": "UnitPriceSpecification", price: p.price, priceCurrency: "AUD", billingDuration: 1, unitCode: "MON" },
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/pricing`,
    })),
    { "@type": "Offer", name: "Day pass", price: PASS_PRICE, priceCurrency: "AUD", availability: "https://schema.org/InStock", url: `${SITE_URL}/pricing` },
  ],
};

export default function Page({ searchParams }: PageProps<"/pricing">) {
  return (
    <div className="page max-w-5xl">
      <JsonLd data={[PRODUCT, faqSchema(PLANS_FAQ)]} />
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
        <Plans searchParams={searchParams} />
      </Suspense>

      <section className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
        <div className="card">
          <h2 className="font-display font-extrabold">What you unlock</h2>
          <p className="mt-1 text-ink-secondary">Our top four in every race with the reasons, the bet and lay calls, rankings across eight categories, and the pressure grid.</p>
        </div>
        <div className="card">
          <h2 className="font-display font-extrabold">What stays free</h2>
          <p className="mt-1 text-ink-secondary">The board, jump times, results, the live market and one free race every day.</p>
        </div>
      </section>

      <FaqList items={PLANS_FAQ} />

      <p className="mt-8 text-xs text-ink-soft text-center">
        Prices in AUD. Subscriptions renew at the end of each month, three months or year until cancelled and can be cancelled any time from your account. Day passes do not expire. 18+ only, gamble responsibly.{" "}
        <Link href="/terms" className="underline">Terms</Link>.
      </p>
    </div>
  );
}

async function Plans({ searchParams }: { searchParams: PageProps<"/pricing">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const signedIn = Boolean(viewer.id);
  const offerUntil = viewer.id ? await firstMonthOfferUntil(viewer.id) : undefined;
  // A choice made before signing up: passes_N, a plan id, or a plan id and term (everyday_year).
  const buy = typeof sp.buy === "string" && /^(passes_\d+|[a-z]+(_(quarter|year))?)$/.test(sp.buy) ? sp.buy : undefined;
  // Monthly leads on every card, with yearly and 3 months beside it on the same card. Behind a
  // Yearly tab that opened first, most sign-ups took yearly without seeing monthly was there (4 Oct 2026).
  const year = termById("year");
  const quarter = termById("quarter");

  return (
    <>
      {buy && signedIn && !viewer.admin && <AutoCheckout buy={buy} />}
      {offerUntil && (
        <div className="card border-lime bg-lime-soft mb-4 text-sm">
          <strong>25% off your first month</strong> on any plan, applied at checkout. Today only, until midnight.
        </div>
      )}
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-display text-lg font-extrabold">Subscriptions</h2>
        <span className="badge badge-prime">{TRIAL_DAYS}-day free trial</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-stretch">
        {PLANS.map((p) => {
          const yearly = termPrice(p, year);
          const quarterly = termPrice(p, quarter);
          const yours = viewer.pro && viewer.plan === p.id;
          return (
            <article key={p.id} className={`pick-card ${p.highlight ? "is-top" : ""}`}>
              {p.highlight && <span className="badge badge-prime self-start">Most popular</span>}
              <div>
                <h3 className="font-display text-xl font-extrabold">{p.name}</h3>
                <p className="text-sm text-ink-soft">{p.blurb}</p>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl font-extrabold tracking-tight nums">${p.price}</span>
                  <span className="text-sm text-ink-soft">a month</span>
                </div>
                <div className="text-sm text-ink-secondary tabular-nums">About {weeklyLabel(p.price)} a week, cancel any time.</div>
              </div>
              <ul className="space-y-1.5 text-sm text-ink-secondary flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-accent font-bold">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {yours ? (
                <Link href="/account" className="btn btn-secondary w-full">Your plan</Link>
              ) : (
                <>
                  <CheckoutButton
                    plan={p.id}
                    term="month"
                    signedIn={signedIn}
                    label={viewer.pro ? "Switch to this plan" : `Try free for ${TRIAL_DAYS} days`}
                    className={`btn w-full ${p.highlight ? "btn-primary" : "btn-secondary"}`}
                  />
                  {!viewer.pro && <p className="-mt-1 text-xs text-ink-soft text-center tabular-nums">Then ${p.price} a month. Cancel before and pay nothing.</p>}
                  {/* The longer terms, on the card and plainly priced: the bill, then the saving. */}
                  {!viewer.pro && termPriceId(p, year) && (
                    <div className="rounded-md border border-line px-3 py-2 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">Or pay yearly</span>
                        <span className="badge badge-prime">Save ${p.price * 12 - yearly}</span>
                      </div>
                      <div className="text-ink-secondary tabular-nums">${yearly} once a year, {weeklyLabel(termMonthly(p, year))} a week.</div>
                      <CheckoutButton plan={p.id} term="year" signedIn={signedIn} label={`Try free, then $${yearly} a year`} className="btn btn-secondary btn-sm w-full mt-2" />
                      {termPriceId(p, quarter) && (
                        <div className="mt-1.5 text-xs text-ink-soft text-center tabular-nums">
                          Or <CheckoutButton plan={p.id} term="quarter" signedIn={signedIn} label={`$${quarterly} every 3 months`} className="underline" />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>

      <div id="passes" className="mt-10 flex items-center gap-3 mb-3 scroll-mt-24">
        <h2 className="font-display text-lg font-extrabold">Day passes</h2>
        <span className="text-sm text-ink-soft">${PASS_PRICE} a day, cheaper in a bundle, use them whenever you like</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <p className="text-sm text-ink-soft tabular-nums">${each.toFixed(2)} a day</p>
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
