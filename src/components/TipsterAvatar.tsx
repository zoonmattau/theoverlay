/**
 * The letters from a name: "The" dropped, an acronym kept whole, else the first
 * letter of up to two words. The Grey Wolf is GW, The Stablemate S, TTL Racing TTL.
 */
export function initials(name: string): string {
  const words = name.trim().replace(/^the\s+/i, "").split(/\s+/).filter(Boolean);
  if (words[0] && /^[A-Z0-9]{2,3}$/.test(words[0])) return words[0];
  return (words.slice(0, 2).map((w) => w[0]).join("") || name.slice(0, 1)).toUpperCase();
}

/** What a tipster's face needs: their name, and the letters or logo they picked. */
export interface TipsterFace {
  name: string;
  avatar_letter?: string | null;
  avatar_url?: string | null;
}

/** Just the face fields, for passing a tipster down to a client component. */
export const faceOf = (t: TipsterFace): TipsterFace => ({ name: t.name, avatar_letter: t.avatar_letter ?? null, avatar_url: t.avatar_url ?? null });

/**
 * A tipster's face wherever they show: the logo they uploaded, else the
 * letters they picked, else their initials, on lime.
 */
export function TipsterAvatar({ tipster, size = 36, className = "" }: { tipster: TipsterFace; size?: number; className?: string }) {
  const letter = (tipster.avatar_letter || initials(tipster.name)).toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * (letter.length > 2 ? 0.3 : letter.length > 1 ? 0.38 : 0.46)) };
  if (tipster.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element -- a small round logo from our own storage, already sized on upload
    return <img src={tipster.avatar_url} alt="" style={style} className={`shrink-0 rounded-full object-cover bg-panel-alt ${className}`} />;
  }
  return (
    <span style={style} className={`shrink-0 rounded-full bg-lime text-ink font-display font-extrabold inline-flex items-center justify-center leading-none ${className}`} aria-hidden>
      {letter}
    </span>
  );
}
