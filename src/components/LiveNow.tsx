import Link from "next/link";

import { liveNow } from "@/lib/activity";

/** Who is on the site right now, page by page: a bar a page, a dot a person, members named on hover. Refreshes with the page. */
export async function LiveNow({ minutes = 5 }: { minutes?: number }) {
  const { pages, people } = await liveNow(minutes);
  const max = Math.max(1, ...pages.map((p) => p.people.length));
  return (
    <div className="card mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display font-extrabold">On the site now</h2>
        <span className="nums text-sm text-ink-soft">{people} {people === 1 ? "person" : "people"} in the last {minutes} minutes</span>
      </div>
      {pages.length === 0 ? (
        <p className="text-sm text-ink-soft">Nobody in the last {minutes} minutes.</p>
      ) : (
        <div className="space-y-1.5">
          {pages.map((p) => (
            <div key={p.path} className="grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-3 text-sm">
              <Link href={p.path} className="truncate underline decoration-dotted underline-offset-2" title={p.path}>{p.label}</Link>
              <div className="h-4 bg-surface-alt rounded overflow-hidden">
                <div className="h-4 bg-lime rounded" style={{ width: `${(100 * p.people.length) / max}%` }} />
              </div>
              <span className="flex items-center gap-1 nums text-ink-secondary">
                {p.people.length}
                <span className="flex gap-0.5 ml-1">
                  {p.people.slice(0, 12).map((x) => (
                    <span key={x.id} className={`inline-block w-2.5 h-2.5 rounded-full ${x.email ? "bg-ink" : "bg-ink-soft"}`} title={`${x.email ?? `visitor ${x.id.slice(2, 8)}`}, ${x.ago < 60 ? `${x.ago}s` : `${Math.round(x.ago / 60)}m`} ago`} />
                  ))}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-ink-soft">A dark dot is a member, a light one a visitor; hover a dot for who and how long ago. A person counts on the page they were last seen on.</p>
    </div>
  );
}
