/**
 * A tipster's face wherever they show: the logo they uploaded, else the
 * letter or two they picked, else the first letter of their name, on lime.
 */
export function TipsterAvatar({ tipster, size = 36, className = "" }: { tipster: { name: string; avatar_letter?: string | null; avatar_url?: string | null }; size?: number; className?: string }) {
  const letter = (tipster.avatar_letter || tipster.name.slice(0, 1)).toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * (letter.length > 1 ? 0.38 : 0.46)) };
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
