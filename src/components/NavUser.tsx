import Link from "next/link";

import { isAdmin } from "@/lib/admin";
import { getViewer, hasAccess } from "@/lib/auth";
import { PASS_PRICE } from "@/lib/billing/plans";
import { getTodayCard } from "@/lib/model/source";

/**
 * Log in and the trial for visitors, the account link for members, and for
 * anyone without today's card open, a day pass button so the way in is
 * always one tap away.
 */
export async function NavUser({ links }: { links: { href: string; label: string }[] }) {
  const viewer = await getViewer();
  const signedOut = !viewer.id && viewer.plan !== "open";
  const { date } = await getTodayCard(viewer.admin);
  const open = hasAccess(viewer, date);
  // Pricing goes away for subscribers and admins; a pass holder still needs it.
  const subscribed = viewer.pro || viewer.admin;
  const nav = links
    .filter((l) => !(subscribed && l.href === "/pricing"))
    .map((l) => (
      <Link key={l.href} href={l.href} className="topbar-link">
        {l.label}
      </Link>
    ));

  const passButton = open ? null : viewer.passCredits > 0 ? (
    <Link href="/tips" className="btn btn-primary btn-sm ml-1">
      Use a day pass
    </Link>
  ) : (
    <Link href="/pricing#passes" className={`btn btn-sm ml-1 ${signedOut ? "btn-secondary btn-onbar" : "btn-primary"}`}>
      <span className="sm:hidden">Today ${PASS_PRICE}</span>
      <span className="hidden sm:inline">Today for ${PASS_PRICE}</span>
    </Link>
  );

  if (signedOut) {
    return (
      <>
        {nav}
        <Link href="/login" className="topbar-link">
          Log in
        </Link>
        {passButton}
        <Link href="/pricing" className="btn btn-primary btn-sm ml-1">
          <span className="sm:hidden">Try free</span>
          <span className="hidden sm:inline">Start free trial</span>
        </Link>
      </>
    );
  }
  return (
    <>
      {nav}
      {isAdmin(viewer) && (
        <Link href="/admin" className="topbar-link">
          Admin
        </Link>
      )}
      {passButton}
      <Link href="/account" className="topbar-link flex items-center gap-2">
        {viewer.pro && <span className="badge badge-prime">Member</span>}
        Account
      </Link>
    </>
  );
}
