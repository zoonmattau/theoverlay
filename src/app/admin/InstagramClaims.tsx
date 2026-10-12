import Link from "next/link";

import { takeBackInstagramDay } from "@/app/admin/actions";
import { Fold } from "@/components/Fold";
import { longDate } from "@/lib/format";
import type { InstagramClaim } from "@/lib/instagram-day";

/**
 * The Instagram free-day claims to spot check, on the Members page (moved off
 * the overview, 12 Oct 2026): the handle opens their profile, and Take back
 * removes the day from anyone who does not follow us. Folded, with the count
 * still to check on the heading.
 */
export function InstagramClaims({ claims }: { claims: InstagramClaim[] }) {
  if (claims.length === 0) return null;
  const open = claims.filter((c) => !c.takenBack).length;
  return (
    <Fold closed title={<>Instagram follows to check <span className="text-sm font-normal text-ink-soft">{open} in the last 30 days</span></>} className="mb-4">
      <p className="mt-1 text-xs text-ink-soft">Each claimed a free day for following us. Open their handle, and remove the claim if they don&apos;t follow: the free day comes off with it.</p>
      <ul className="mt-2 divide-y divide-line-soft">
        {claims.map((c) => (
          <li key={`${c.userId}-${c.at}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <Link href={`/admin/${c.userId}`} className="font-semibold hover:text-blue">{c.who}</Link>
            {c.handle ? <a href={`https://instagram.com/${encodeURIComponent(c.handle)}`} target="_blank" rel="noreferrer" className="text-blue underline">@{c.handle}</a> : <span className="text-ink-soft">no handle given</span>}
            <span className="text-xs text-ink-soft nums">{longDate(c.at.slice(0, 10))}{c.nextBill ? ", next bill moved a day" : ""}</span>
            <span className="ml-auto">
              {c.takenBack ? <span className="text-xs text-red font-semibold">Claim and day removed</span> : (
                <form action={takeBackInstagramDay.bind(null, c.userId)}><button type="submit" className="btn btn-secondary btn-sm text-red">Remove claim and free day</button></form>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Fold>
  );
}
