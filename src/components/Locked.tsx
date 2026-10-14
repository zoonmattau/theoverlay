import Link from "next/link";

import { Section } from "./Section";

/**
 * A teaser in place of a paid section. Nothing real is rendered behind it,
 * so there is nothing to un-blur in the DOM. The first locked section on a
 * page carries the way in; the rest are `brief`, one line, so a page does not
 * repeat the same box three times.
 */
export function Locked({
  id,
  title,
  letter,
  lines = 8,
  raceId,
  heading = "Unlock this race",
  brief = false,
  account,
}: {
  id: string;
  title: string;
  letter: string;
  lines?: number;
  raceId?: string;
  heading?: string;
  brief?: boolean;
  /** The free race's own path: the way in is a free account with a confirmed email, not a plan. */
  account?: string;
}) {
  const signup = account ? `/signup?next=${encodeURIComponent(account)}` : "";
  if (brief && account) {
    return (
      <Section id={id} letter={letter} title={title} aside="Free with an account">
        <div className="section-body text-sm text-ink-secondary">
          Opens with a free account.{" "}
          <Link href={signup} className="font-semibold text-blue">Make one, no card</Link>
        </div>
      </Section>
    );
  }
  if (brief) {
    return (
      <Section id={id} letter={letter} title={title} aside="Members only">
        <div className="section-body text-sm text-ink-secondary">
          Opens with a plan or a day pass.{" "}
          <Link href={`/pricing${raceId ? `?from=${encodeURIComponent(raceId)}` : ""}`} className="font-semibold text-blue">
            Join and get a week free
          </Link>
        </div>
      </Section>
    );
  }
  return (
    <Section id={id} letter={letter} title={title} aside="Members only">
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
          {account ? (
            <div className="card text-center max-w-xs shadow-lift py-3">
              <div className="font-display font-extrabold">Free with an account</div>
              <p className="mt-1 text-xs text-ink-secondary">
                Today&apos;s free race opens once you make an account. No card needed.
              </p>
              <Link href={signup} className="btn btn-primary mt-3 w-full">Make a free account</Link>
              <Link href={`/login?next=${encodeURIComponent(account)}`} className="mt-2 block text-xs text-ink-soft hover:text-ink">
                Already have one? Log in
              </Link>
            </div>
          ) : (
            <div className="card text-center max-w-xs shadow-lift py-3">
              <div className="font-display font-extrabold">{heading}</div>
              <p className="mt-1 text-xs text-ink-secondary">
                A plan or a day pass opens every tip, rating and rated price on today&apos;s board.
              </p>
              <Link
                href={`/pricing${raceId ? `?from=${encodeURIComponent(raceId)}` : ""}`}
                className="btn btn-primary mt-3 w-full"
              >
                Join and get a week free
              </Link>
              <Link href="/pricing" className="mt-2 block text-xs text-blue font-semibold">
                Or a day pass from $10
              </Link>
              <Link href="/login" className="mt-1 block text-xs text-ink-soft hover:text-ink">
                Already a member? Log in
              </Link>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
