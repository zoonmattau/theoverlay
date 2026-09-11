import Link from "next/link";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";

/** Log in for visitors, the account link for members, a pass badge for payers. */
export async function NavUser() {
  const viewer = await getViewer();
  if (!viewer.id && viewer.plan !== "open") {
    return (
      <>
        <Link href="/login" className="topbar-link">
          Log in
        </Link>
        <Link href="/pricing" className="btn btn-primary btn-sm ml-1">
          Start free trial
        </Link>
      </>
    );
  }
  return (
    <>
      {isAdmin(viewer) && (
        <Link href="/admin" className="topbar-link">
          Admin
        </Link>
      )}
      <Link href="/account" className="topbar-link flex items-center gap-2">
        {viewer.pro && <span className="badge badge-prime">Member</span>}
        Account
      </Link>
    </>
  );
}
