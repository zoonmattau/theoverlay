/** A card that folds to its heading: open on load, a click on the heading closes it. The named group keeps its arrow apart from folds inside it. Shared by Money and Activity. */
export function Fold({ title, id, className = "", summary, children }: { title: React.ReactNode; id?: string; className?: string; summary?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details open id={id} className={`card group/fold min-w-0 scroll-mt-20 ${className}`}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <h2 className="flex items-center gap-2 font-display font-extrabold">
          <span className="inline-block text-sm transition-transform group-open/fold:rotate-90" aria-hidden>▸</span>
          {title}
        </h2>
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
