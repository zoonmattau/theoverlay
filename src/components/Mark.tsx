/**
 * The Overlay mark: the price line and arrow in lime inside a frame that
 * takes currentColor. Same paths as public/brand/mark-*.svg.
 */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" className={className}>
      <rect x="1.5" y="1.5" width="97" height="97" stroke="currentColor" strokeWidth="3" />
      <path
        d="M12 84 L44 50 L54 60 L78 33.2"
        stroke="var(--color-lime)"
        strokeWidth="6"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path d="M90 19.8 L84.7 39.2 L71.3 27.2 Z" fill="var(--color-lime)" />
    </svg>
  );
}

/** Wordmark as live text so it stays crisp and recolours with the theme. */
export function Wordmark() {
  return (
    <span className="flex items-baseline gap-1.5 font-display leading-none">
      <span className="text-[0.6rem] font-bold tracking-[0.28em] text-lime">
        THE
      </span>
      <span className="text-lg font-extrabold tracking-tight text-bar-ink">
        OVERLAY
      </span>
    </span>
  );
}
