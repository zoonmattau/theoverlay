import Link from "next/link";

import { getViewer } from "@/lib/auth";

/** The new-member offer, under the top bar for anyone who has not subscribed yet: the free week on the first bill. */
export async function LaunchOffer() {
  const viewer = await getViewer();
  if (viewer.pro || viewer.admin || viewer.tipster) return null;
  return (
    <Link href="/pricing" className="offer-bar">
      <span className="offer-tag">New members</span>
      <span className="offer-cta">Join today, get a week free</span>
    </Link>
  );
}
