import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { latestPublishedReview } from "@/lib/reviews";

export const metadata: Metadata = { title: "Saturday review", alternates: { canonical: "/review" } };

/** The latest review, or the home page until one exists. */
export default async function Page() {
  const latest = await latestPublishedReview();
  redirect(latest ? `/review/${latest.date}` : "/");
}
