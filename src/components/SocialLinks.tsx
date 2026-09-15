/**
 * Social handles as small icons linking out; nothing shows for a handle not
 * given. A tipster's, or ours. `discord` is an invite link, not a handle.
 * With `labels`, each icon carries its name too, for the footer.
 */
export function SocialLinks({ instagram, twitter, tiktok, discord, labels, className = "" }: { instagram?: string | null; twitter?: string | null; tiktok?: string | null; discord?: string | null; labels?: boolean; className?: string }) {
  const links: { href: string; label: string; name: string; icon: React.ReactNode }[] = [];
  if (discord) links.push({ href: discord, label: "Join our Discord", name: "Discord", icon: <Discord /> });
  if (instagram) links.push({ href: `https://instagram.com/${clean(instagram)}`, label: `@${clean(instagram)} on Instagram`, name: "Instagram", icon: <Instagram /> });
  if (twitter) links.push({ href: `https://x.com/${clean(twitter)}`, label: `@${clean(twitter)} on X`, name: "X", icon: <XLogo /> });
  if (tiktok) links.push({ href: `https://tiktok.com/@${clean(tiktok)}`, label: `@${clean(tiktok)} on TikTok`, name: "TikTok", icon: <TikTok /> });
  if (links.length === 0) return null;
  return (
    <span className={`social-links ${labels ? "social-links-labelled" : ""} ${className}`}>
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noopener" className={labels ? "social-link-labelled" : "social-link"} title={l.label} aria-label={l.label}>
          <span className="social-link">{l.icon}</span>
          {labels && <span>{l.name}</span>}
        </a>
      ))}
    </span>
  );
}

/** A handle as typed, with the @ and any URL prefix stripped. */
export const clean = (handle: string) => handle.trim().replace(/^https?:\/\/(www\.)?(instagram\.com|x\.com|twitter\.com|tiktok\.com)\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");

function Discord() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.2.4a18 18 0 0 1 4.6 1.8 15.9 15.9 0 0 0-15.6 0A18 18 0 0 1 8.8 3.4L8.6 3a19.6 19.6 0 0 0-4.9 1.4C.6 9.1-.2 13.7.2 18.2a19.7 19.7 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4a12.7 12.7 0 0 1-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.5-5.2-.9-9.7-3.5-13.8zM8.5 15.4c-1.2 0-2.1-1.1-2.1-2.4s1-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4zm7 0c-1.2 0-2.1-1.1-2.1-2.4s1-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4z" />
    </svg>
  );
}

function Instagram() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function XLogo() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M18.2 2h3.4l-7.4 8.5L23 22h-6.8l-5.3-7-6.1 7H1.4l7.9-9.1L1 2h7l4.8 6.4L18.2 2zm-1.2 18h1.9L7.1 3.9H5.1L17 20z" />
    </svg>
  );
}

function TikTok() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16.5 2c.3 2.5 1.8 4.3 4.3 4.6v3.4c-1.6 0-3.1-.5-4.3-1.3v6.9c0 3.6-2.9 6.4-6.5 6.4S3.5 19.2 3.5 15.6s2.9-6.4 6.5-6.4c.4 0 .7 0 1 .1v3.5c-.3-.1-.7-.2-1-.2-1.6 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3V2h3.5z" />
    </svg>
  );
}
