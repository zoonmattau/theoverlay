import Link from "next/link";

/** Where a lost visitor most likely meant to go, after today's card. */
const ELSEWHERE = [
  { href: "/tips", title: "Today's tips", sub: "Every call on the card" },
  { href: "/results", title: "Results", sub: "Every call we have made, settled" },
  { href: "/tipsters", title: "Tipsters", sub: "Their calls and their record" },
  { href: "/data", title: "Datahub", sub: "Horses, jockeys, trainers and tracks" },
];

/**
 * A page that isn't there: said in racing terms, then the way back. Old race
 * pages are the usual cause, a card we no longer hold, so today's card leads.
 */
export default function NotFound() {
  return (
    <div className="page max-w-3xl">
      <div className="card mt-10 overflow-hidden p-0!">
        <div className="bg-bar px-6 py-8 sm:px-10 sm:py-10">
          <p className="nums text-xs font-extrabold uppercase tracking-[0.14em] text-lime">404 · Scratched</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight text-bar-ink sm:text-4xl">This page didn&apos;t make the field.</h1>
          <p className="mt-3 max-w-md leading-relaxed text-bar-soft">
            The link is wrong, the page has moved, or it&apos;s a race from a card we no longer hold.
          </p>
          <Link href="/" className="btn btn-primary mt-6">
            Today&apos;s card
          </Link>
        </div>
        <ul className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2">
          {ELSEWHERE.map((l) => (
            <li key={l.href} className="bg-panel">
              <Link href={l.href} className="group block px-6 py-4 hover:bg-panel-alt sm:px-10">
                <span className="font-display font-bold text-ink group-hover:underline decoration-lime decoration-2 underline-offset-4">{l.title} →</span>
                <span className="mt-0.5 block text-sm text-ink-soft">{l.sub}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
