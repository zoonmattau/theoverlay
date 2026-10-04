import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { MonthlyOffer } from "@/components/MonthlyOffer";
import { getViewer } from "@/lib/auth";
import { monthlyFor } from "@/lib/billing/retention";
import { stripeConfigured } from "@/lib/billing/stripe";

export const metadata: Metadata = { title: "Pay monthly", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/account/monthly">) {
  return (
    <div className="page max-w-2xl">
      <Suspense fallback={<div className="skeleton h-64 mt-6" />}>
        <Monthly searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** The pay-monthly offer on its own, for the emails: a long-term bill that failed, or is about to fall. */
async function Monthly({ searchParams }: { searchParams: PageProps<"/account/monthly">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  if (!viewer.id) redirect("/login?next=%2Faccount%2Fmonthly");
  if (!stripeConfigured() || !viewer.stripeCustomerId) redirect("/account");
  const offer = await monthlyFor(viewer.id);
  if (!offer) redirect("/account");
  return (
    <section className="py-10">
      <MonthlyOffer offer={offer} declined={sp.card === "declined"} back="/account/monthly" />
      <div className="mt-6 flex flex-wrap gap-2">
        {offer.failedInvoice && (
          <a href="/account/pay" className="btn btn-secondary btn-sm">
            Pay ${offer.termPrice} instead, get a month free
          </a>
        )}
        <Link href="/account" className="btn btn-secondary btn-sm">Back to your account</Link>
      </div>
    </section>
  );
}
