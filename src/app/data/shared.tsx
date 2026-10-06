import Link from "next/link";
import { connection } from "next/server";

import { getViewer, hasAccess } from "@/lib/auth";
import { getTodayCard } from "@/lib/model/source";

/** Who is looking, and whether the hub is open to them: members with access, tipsters and admins. */
export async function hubViewer(): Promise<{ open: boolean }> {
  await connection();
  const viewer = await getViewer();
  const { date } = await getTodayCard(viewer.admin);
  return { open: hasAccess(viewer, date) };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
export const param = async (searchParams: Promise<Record<string, string | string[] | undefined>>, key: string) => str((await searchParams)[key]);

/** In place of a table for someone without access. */
export function HubLocked({ what }: { what: string }) {
  return (
    <div className="card text-center max-w-md mx-auto my-8 py-6">
      <div className="font-display font-extrabold text-lg">Members only</div>
      <p className="mt-2 text-sm text-ink-secondary">{what} are part of a plan, with today&apos;s calls and every race page.</p>
      <div className="mt-4 flex justify-center gap-2">
        <Link href="/pricing" className="btn btn-primary btn-sm">Start free trial</Link>
        <Link href="/login?next=/data/jockeys" className="btn btn-secondary btn-sm">Log in</Link>
      </div>
    </div>
  );
}

/**
 * The first few rows of a members' table, fading out over the lock: a visitor sees what is
 * behind it rather than a blank page with a box (6 Oct 2026).
 */
export function HubPreview({ what, children }: { what: string; children: React.ReactNode }) {
  return (
    <section className="py-6">
      <div className="relative max-h-80 overflow-hidden pointer-events-none select-none" aria-hidden>
        {children}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
      </div>
      <HubLocked what={what} />
    </section>
  );
}

