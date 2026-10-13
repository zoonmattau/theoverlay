import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AutoCheckout } from "@/components/AutoCheckout";
import { JsonLd, SITE_URL } from "@/components/JsonLd";
import { getViewer } from "@/lib/auth";
import { PassPicker } from "@/components/PassPicker";
import { PlanPicker, type PickerPlan } from "@/components/PlanPicker";
import { supabaseAdmin } from "@/lib/billing/access";
import { comebackDays } from "@/lib/billing/comeback";
import { firstMonthOfferUntil } from "@/lib/billing/first-month";
import { PASS_BUNDLES, PASS_PRICE, PLANS, termById, termPrice, termPriceId, termSave, TERM_SAVES } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Saturday, Saturday plus Wednesday, or every day, with a free week on your first month. Or buy day passes and use them when you like.",
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
      <JsonLd data={[PRODUCT]} />
      {/* On a phone the highlight broke across lines ("before" / "you bet."): it is one block on a line of its own there. */}
      <section className="text-center max-w-2xl mx-auto pt-6 pb-8 sm:py-6">
        <h1 className="font-display text-4xl sm:text-4xl font-extrabold tracking-tight leading-[1.15]">
          Know the price <br className="sm:hidden" />
          <span className="inline-block whitespace-nowrap bg-lime px-2 mt-1 sm:mt-0 rounded-sm">before you bet.</span>
        </h1>
        <p className="mt-3 text-ink-secondary">Every plan comes with a free week: your first month runs 5 weeks.</p>
      </section>

      <Suspense fallback={<div className="skeleton h-96" />}>
        <Plans searchParams={searchParams} />
      </Suspense>

      <p className="mt-8 text-xs text-ink-soft text-center">
        Prices in AUD. Subscriptions renew each week, month, quarter or year until cancelled, and can be cancelled any time from your account. Every plan starts today, and the first bill on monthly, quarterly or yearly comes with a free week on top. Day passes do not expire, and one used after 4pm Sydney time opens the next day too. 18+ only, gamble responsibly.{" "}
        <Link href="/terms" className="underline">Terms</Link>.
      </p>
    </div>
  );
}

async function Plans({ searchParams }: { searchParams: PageProps<"/pricing">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const signedIn = Boolean(viewer.id);
  const offerUntil = viewer.id ? await firstMonthOfferUntil(viewer.id) : undefined;
  // The free week is on a first subscription, or a returning member's when the win-back offered it, as checkout gives it.
  const subscribedBefore = viewer.id ? Boolean((await supabaseAdmin().from("profiles").select("subscription_status").eq("id", viewer.id).maybeSingle()).data?.subscription_status) : false;
  const freeWeek = !viewer.pro && (!subscribedBefore || (await comebackDays(viewer.id!)) > 0);
  // A choice made before signing up: passes_N, a plan id, or a plan id and term (everyday_year).
  const buy = typeof sp.buy === "string" && /^(passes_\d+|[a-z]+(_(quarter|year|week))?)$/.test(sp.buy) ? sp.buy : undefined;
  // The plans and the three ways to pay, on one switch that starts on Monthly (components/PlanPicker).
  // Saturday, then Saturday + Wednesday, then Every day: smallest to the full board.
  const plans: PickerPlan[] = PLANS.map((p) => ({
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    features: p.features,
    days: p.days,
    highlight: p.highlight,
    prices: {
      month: p.price,
      ...(termPriceId(p, termById("quarter")) ? { quarter: termPrice(p, termById("quarter")) } : {}),
      ...(termPriceId(p, termById("year")) ? { year: termPrice(p, termById("year")) } : {}),
      ...(termPriceId(p, termById("week")) ? { week: termPrice(p, termById("week")) } : {}),
    },
    saves: { month: termSave(p, termById("month")), quarter: termSave(p, termById("quarter")), year: termSave(p, termById("year")) },
  }));

  return (
    <>
      {buy && signedIn && !viewer.admin && <AutoCheckout buy={buy} />}
      {offerUntil && (
        <div className="card border-lime bg-lime-soft mb-4 text-sm">
          <strong>25% off your first month</strong> on any plan, applied at checkout. Today only, until midnight.
        </div>
      )}
      <PlanPicker plans={plans} signedIn={signedIn} pro={Boolean(viewer.pro)} currentPlan={viewer.plan ?? undefined} savings={TERM_SAVES} freeWeek={freeWeek} />

      <PassPicker bundles={PASS_BUNDLES.map(({ qty, price }) => ({ qty, price }))} single={PASS_PRICE} signedIn={signedIn} />
      <p className="mt-6 text-center text-sm text-ink-secondary">
        Questions, or trouble signing up or paying?{" "}
        <a href="mailto:hello@theoverlay.com.au" className="font-semibold text-blue underline underline-offset-2">hello@theoverlay.com.au</a>{" "}
        and we will sort it out.
      </p>
    </>
  );
}
