import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getViewer } from "@/lib/auth";
import { stripeConfigured } from "@/lib/billing/stripe";
import { owedFor } from "@/lib/billing/unpaid";
import { payNow, useNewCard } from "./actions";

export const metadata: Metadata = { title: "Keep your board open", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/account/pay">) {
  return (
    <div className="page max-w-2xl">
      <Suspense fallback={<div className="skeleton h-64 mt-6" />}>
        <Pay searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * Where every failed-payment email points: pay the open bill now, on the card
 * on file or a new one. Buttons, never a charge on opening the page, since
 * mail scanners open links before people do.
 */
async function Pay({ searchParams }: { searchParams: PageProps<"/account/pay">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  if (!viewer.id) redirect("/login?next=%2Faccount%2Fpay");
  if (!stripeConfigured() || !viewer.stripeCustomerId) redirect("/account");
  const owed = await owedFor(viewer.id);
  if (!owed) redirect("/account");
  const amount = `$${owed.amount.toFixed(owed.amount % 1 ? 2 : 0)}`;
  const method = owed.method;
  return (
    <section className="py-10">
      <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold">Your payment</p>
      <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Keep your board open.</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        Your payment for {owed.planName} did not go through. Pay it now and your board opens straight away: every runner rated, the bets and lays at 11am, and the Data Hub.
        {owed.longTerm ? ` Pay today and we add a month on us, ${owed.months + 1} months for the price of ${owed.months}.` : ""}
      </p>
      <div className="card border-lime bg-lime-soft mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-display text-xl font-extrabold tracking-tight nums">{amount}{owed.longTerm ? ", plus a month free" : ""}</div>
          <div className="text-sm text-ink-secondary">{method ? `With ${method}.` : "Add a card to pay."}</div>
          {sp.card === "new" && <div className="mt-1 text-sm font-semibold">Card saved. Press pay to use it.</div>}
          {sp.card === "declined" && <div className="mt-1 text-sm text-red font-semibold">That card was declined, so nothing was charged. Try another card.</div>}
        </div>
        {method && (
          <form action={payNow}>
            <button type="submit" className="btn btn-primary">Pay {amount} now</button>
          </form>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={useNewCard}>
          <button type="submit" className="btn btn-secondary btn-sm">Use a different card</button>
        </form>
        {owed.longTerm && (
          <Link href="/account/monthly" className="btn btn-secondary btn-sm">Go month to month instead</Link>
        )}
        <Link href="/account" className="btn btn-secondary btn-sm">Back to your account</Link>
      </div>
    </section>
  );
}
