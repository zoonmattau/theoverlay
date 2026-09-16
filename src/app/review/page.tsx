import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { latestPublishedReview } from "@/lib/reviews";

export const metadata: Metadata = { title: "Saturday review", alternates: { canonical: "/review" } };

/** The latest review, or the home page until one exists. */
export default function Page() {
  return (
    <Suspense fallback={<div className="page"><div className="skeleton h-96 mt-6" /></div>}>
      <Latest />
    </Suspense>
  );
}

async function Latest(): Promise<null> {
  await connection();
  const latest = await latestPublishedReview();
  redirect(latest ? `/review/${latest.date}` : "/");
}
