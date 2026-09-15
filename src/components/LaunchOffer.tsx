import Link from "next/link";

import { getViewer } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/billing/plans";

/** The launch offer, under the top bar for anyone who has not subscribed yet. */
export async function LaunchOffer() {
  const viewer = await getViewer();
  if (viewer.pro || viewer.admin || viewer.tipster) return null;
  return (
    <Link href="/pricing" className="offer-bar">
      <span className="offer-tag">Launch offer</span>
      <span className="offer-cta">Join today for {TRIAL_DAYS === 7 ? "one week" : `${TRIAL_DAYS} days`} free</span>
    </Link>
  );
}
