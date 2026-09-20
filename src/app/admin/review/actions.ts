"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { fetchReviewBatch, type FetchProgress, type FetchScope } from "@/lib/model/review";
import { writeStory } from "@/lib/model/store";
import { publishReview, type PublishedReview } from "@/lib/reviews";

/**
 * One batch of the review's Form King buys for a date, as far as the time
 * budget allows. The button calls again while `remaining` is above zero.
 */
export async function fetchReview(date: string, refresh = false, scope: FetchScope = "all"): Promise<FetchProgress> {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) throw new Error("Not allowed.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Bad date.");
  const progress = await fetchReviewBatch(date, { refresh, scope });
  revalidatePath(`/admin/review/${date}`);
  revalidatePath("/admin/review");
  return progress;
}

/** Publishes the public Saturday review for a date: the storylines go to the site and, the first time, to Discord. */
export async function publishSaturdayReview(date: string): Promise<PublishedReview> {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) throw new Error("Not allowed.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Bad date.");
  const published = await publishReview(date);
  revalidatePath(`/admin/review/${date}`);
  return published;
}

/** Saves the races a day's story tells, in order; an empty list goes back to the default. */
export async function saveStory(date: string, races: string[]): Promise<void> {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) throw new Error("Not allowed.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Bad date.");
  await writeStory(date, races.map((r) => r.trim()).filter((r) => /^[A-Za-z0-9_-]+$/.test(r)));
  revalidatePath(`/admin/review/${date}/story`);
}
