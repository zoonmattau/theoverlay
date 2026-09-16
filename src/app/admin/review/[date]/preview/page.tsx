import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ReviewStory } from "@/components/ReviewStory";
import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { longDate } from "@/lib/format";
import { buildReview } from "@/lib/model/review";
import { previewReview } from "@/lib/reviews";
import { PublishButton } from "../../PublishButton";

export const metadata: Metadata = { title: "Review preview", robots: { index: false } };

export default function Page({ params }: PageProps<"/admin/review/[date]/preview">) {
  return (
    <div className="page max-w-4xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Preview params={params} />
      </Suspense>
    </div>
  );
}

/** The public review as it would be published now, built from the weekly review without storing anything. */
async function Preview({ params }: { params: PageProps<"/admin/review/[date]/preview">["params"] }) {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const review = await buildReview(date);
  if (!review) notFound();
  const preview = previewReview(review);
  return (
    <>
      <section className="py-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold">
            <Link href="/admin/review" className="underline">Weekly review</Link> · <Link href={`/admin/review/${date}`} className="underline">{longDate(date)}</Link> · Preview
          </p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Saturday review, as members would see it</h1>
          <p className="mt-1 text-sm text-ink-soft">Nothing is stored or posted until you publish. Points on our scale only, no benchmark lengths.</p>
        </div>
        <PublishButton date={date} published={preview.publishedAt || undefined} />
      </section>
      <div className="card border-lime">
        <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold mb-3">Saturday review · {longDate(date)}</p>
        <ReviewStory review={preview} />
      </div>
    </>
  );
}
