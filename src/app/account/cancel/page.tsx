import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PortalButton } from "@/components/PortalButton";
import { getViewer } from "@/lib/auth";
import { offerFor } from "@/lib/billing/retention";
import { stripeConfigured } from "@/lib/billing/stripe";
import { longDate } from "@/lib/format";
import { cancelAnyway, keepAtHalfPrice } from "./actions";

export const metadata: Metadata = { title: "Before you go", robots: { index: false } };

export default function Page() {
  return (
    <div className="page max-w-2xl">
      <Suspense fallback={<div className="skeleton h-64 mt-6" />}>
        <Cancel />
      </Suspense>
    </div>
  );
}

/** The step before Stripe's cancellation: half price on the first month, once, for anyone not yet charged. */
async function Cancel() {
  const viewer = await getViewer();
  if (!viewer.id) redirect("/login?next=%2Faccount%2Fcancel");
  if (!stripeConfigured() || !viewer.stripeCustomerId) redirect("/account");
  const offer = await offerFor(viewer.id);

  if ("reason" in offer) {
    return (
      <section className="py-10">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Cancel your plan</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          {offer.reason === "no-subscription" ? "There is no plan on this account to cancel." : "Cancelling stops the next charge; the board stays open until the end of what you have paid for."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {offer.reason !== "no-subscription" && <PortalButton />}
          <Link href="/account" className="btn btn-secondary btn-sm">Back to your account</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="py-10">
      <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold">Before you go</p>
      <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Stay for half price.</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        Keep {offer.planName} and your first month is <strong className="nums">${offer.offered.toFixed(2)}</strong> instead of ${offer.full}
        {offer.chargeOn ? `, charged on ${longDate(offer.chargeOn)}` : ""}. Every month after that is the normal price, and you can still cancel any time.
      </p>
      <div className="card border-lime bg-lime-soft mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-display text-xl font-extrabold tracking-tight">First month ${offer.offered.toFixed(2)}</div>
          <div className="text-sm text-ink-secondary">Then ${offer.full} a month. One-time offer.</div>
        </div>
        <form action={keepAtHalfPrice}>
          <button type="submit" className="btn btn-primary">Keep my plan at half price</button>
        </form>
      </div>
      <form action={cancelAnyway} className="mt-4">
        <button type="submit" className="text-sm text-ink-soft underline">No thanks, cancel my plan</button>
      </form>
    </section>
  );
}
