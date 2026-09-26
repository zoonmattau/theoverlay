import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PortalButton } from "@/components/PortalButton";
import { getViewer } from "@/lib/auth";
import { weeklyLabel } from "@/lib/billing/plans";
import { downgradesFor, offerFor, type Downgrades } from "@/lib/billing/retention";
import { stripeConfigured } from "@/lib/billing/stripe";
import { longDate } from "@/lib/format";
import { cancelAnyway, keepAtHalfPrice, moveToPlan } from "./actions";

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
  const [offer, cheaper] = await Promise.all([offerFor(viewer.id), downgradesFor(viewer.id)]);

  if ("reason" in offer) {
    return (
      <section className="py-10">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Cancel your plan</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          {offer.reason === "no-subscription" ? "There is no plan on this account to cancel." : "Cancelling stops the next charge; the board stays open until the end of what you have paid for."}
        </p>
        {cheaper && <Cheaper offer={cheaper} />}
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
      {cheaper && <Cheaper offer={cheaper} />}
      <form action={cancelAnyway} className="mt-4">
        <button type="submit" className="text-sm text-ink-soft underline">No thanks, cancel my plan</button>
      </form>
    </section>
  );
}

/** The plans under theirs, for someone who wants the board on fewer days for less. */
function Cheaper({ offer }: { offer: Downgrades }) {
  return (
    <div className="mt-6">
      <h2 className="font-display text-xl font-extrabold tracking-tight">Or pay less for fewer days.</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        {offer.trialing ? "Your free trial carries over and the new price starts when it ends." : "The rest of this month is credited to your next bill."}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {offer.options.map(({ plan: p, price }) => (
          <form key={p.id} action={moveToPlan} className="card flex flex-col gap-3">
            <input type="hidden" name="plan" value={p.id} />
            <div>
              <div className="font-display text-lg font-extrabold tracking-tight">{p.name}</div>
              <div className="text-sm text-ink-secondary">
                <span className="nums">${price}</span> {offer.term.every}, <span className="nums">{weeklyLabel(price / offer.term.months)}</span> a week. {p.blurb}
              </div>
            </div>
            <button type="submit" className="btn btn-secondary btn-sm mt-auto self-start">Switch to {p.name}</button>
          </form>
        ))}
      </div>
    </div>
  );
}
