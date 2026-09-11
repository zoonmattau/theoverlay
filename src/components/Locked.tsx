import Link from "next/link";

import { Section } from "./Section";

/**
 * A teaser in place of a paid section. Nothing real is rendered behind it,
 * so there is nothing to un-blur in the DOM.
 */
export function Locked({
  id,
  title,
  letter,
  lines = 8,
  raceId,
  heading = "Unlock this race",
}: {
  id: string;
  title: string;
  letter: string;
  lines?: number;
  raceId?: string;
  heading?: string;
}) {
  return (
    <Section id={id} letter={letter} title={title} aside="Pass holders only">
      <div className="section-body relative min-h-[280px]">
        <div className="space-y-2.5" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-5 w-5 rounded-sm bg-surface-alt" />
              <div className="h-3 rounded bg-surface-alt" style={{ width: `${26 + ((i * 37) % 44)}%` }} />
              <div className="h-3 w-10 rounded bg-surface" />
              <div className="ml-auto h-3 w-12 rounded bg-surface-alt" />
              <div className="h-3 w-14 rounded bg-surface" />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="card text-center max-w-xs shadow-lift py-3">
            <div className="font-display font-extrabold">{heading}</div>
            <p className="mt-1 text-xs text-ink-secondary">
              A plan or a day pass opens every tip, rating and rated price on today&apos;s board.
            </p>
            <Link
              href={`/pricing${raceId ? `?from=${encodeURIComponent(raceId)}` : ""}`}
              className="btn btn-primary mt-3 w-full"
            >
              Try free for 7 days
            </Link>
            <Link href="/pricing" className="mt-2 block text-xs text-blue font-semibold">
              Or a day pass from $10
            </Link>
            <Link href="/login" className="mt-1 block text-xs text-ink-soft hover:text-ink">
              Already a member? Log in
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
