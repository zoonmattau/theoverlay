import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ReviewStory } from "@/components/ReviewStory";
import { longDate } from "@/lib/format";
import { readPublishedReview } from "@/lib/reviews";

export async function generateMetadata({ params }: PageProps<"/review/[date]">): Promise<Metadata> {
  const { date } = await params;
  return {
    title: `Saturday review, ${longDate(date)}`,
    description: "How every runner ran against the mark we had it at: the run of the day, the ones that slipped under the radar, the disappointments and the features.",
    alternates: { canonical: `/review/${date}` },
  };
}

export default function Page({ params }: PageProps<"/review/[date]">) {
  return (
    <div className="page max-w-4xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Review params={params} />
      </Suspense>
    </div>
  );
}

async function Review({ params }: { params: PageProps<"/review/[date]">["params"] }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const review = await readPublishedReview(date);
  if (!review) notFound();
  return (
    <>
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold">Saturday review</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{longDate(date)}</h1>
        <p className="mt-1 text-sm text-ink-soft">Every runner&apos;s run on our scale against the mark we priced it at, the morning of the race.</p>
      </section>
      <ReviewStory review={review} />
      <section className="card border-lime bg-lime-soft mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-extrabold tracking-tight">See the numbers before the race, not after.</h2>
          <p className="mt-1 text-sm text-ink-secondary">Every runner rated, a rated price against the market, and the calls, every race day. 7-day free trial.</p>
        </div>
        <Link href="/pricing" className="btn btn-primary">Start free trial</Link>
      </section>
    </>
  );
}
