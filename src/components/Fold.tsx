/**
 * A card that folds to its heading: open on load (shut with `closed`), a click on the heading closes it.
 * The named group keeps its arrow apart from folds inside it. `controls` (window or filter buttons) sit
 * on the heading's line on a wide screen but outside the heading, so a tap on one never folds the card,
 * and they go with the body when it is folded. Shared by the admin pages, the tipster page, race pages and home.
 */
export function Fold({ title, id, className = "", summary, controls, closed, children }: { title: React.ReactNode; id?: string; className?: string; summary?: React.ReactNode; controls?: React.ReactNode; closed?: boolean; children: React.ReactNode }) {
  return (
    <details open={!closed} id={id} className={`card group/fold min-w-0 scroll-mt-20 relative ${className}`}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <h2 className="flex items-center gap-2 font-display font-extrabold min-h-8">
          <span className="inline-block text-sm transition-transform group-open/fold:rotate-90" aria-hidden>▸</span>
          {title}
        </h2>
        {summary}
      </summary>
      {controls && <div className="mt-2 sm:mt-0 sm:absolute sm:right-4 sm:top-3">{controls}</div>}
      <div className="mt-2">{children}</div>
    </details>
  );
}
