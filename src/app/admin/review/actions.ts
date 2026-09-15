"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { fetchReviewBatch, type FetchProgress } from "@/lib/model/review";

/**
 * One batch of the review's Form King buys for a date, as far as the time
 * budget allows. The button calls again while `remaining` is above zero.
 */
export async function fetchReview(date: string, refresh = false): Promise<FetchProgress> {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) throw new Error("Not allowed.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Bad date.");
  const progress = await fetchReviewBatch(date, { refresh });
  revalidatePath(`/admin/review/${date}`);
  revalidatePath("/admin/review");
  return progress;
}
