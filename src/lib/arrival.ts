/**
 * How a visitor arrived: the first page they landed on, where they came
 * from and any campaign tags on the link. Set once by the proxy on the first
 * visit and copied onto the profile at sign-up, so the admin can see how a
 * member found us. Shared by the proxy (edge) and the server, so nothing
 * server-only lives here.
 */

export const ARRIVAL_COOKIE = "overlay_arrival";
/** Days the first visit is remembered while they make up their mind. */
export const ARRIVAL_DAYS = 60;

export interface Arrival {
  /** Path and query of the first page. */
  landing: string;
  /** Full referring URL, absent for a direct visit. */
  referrer?: string;
  /** utm_source, utm_medium, utm_campaign, utm_content, utm_term when present. */
  utm?: Record<string, string>;
  /** ISO, when they first arrived. */
  at: string;
}

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

/** The arrival a request represents, or nothing when it is our own page linking to another. */
export function arrivalFrom(url: URL, referer: string | null, now = new Date()): Arrival {
  const utm: Record<string, string> = {};
  for (const k of UTM) {
    const v = url.searchParams.get(k);
    if (v) utm[k.slice(4)] = v.slice(0, 120);
  }
  let referrer: string | undefined;
  if (referer) {
    try {
      const r = new URL(referer);
      if (r.host !== url.host) referrer = r.toString().slice(0, 500);
    } catch {
      // Not a URL, ignore it.
    }
  }
  return { landing: `${url.pathname}${url.search}`.slice(0, 500), referrer, utm: Object.keys(utm).length ? utm : undefined, at: now.toISOString() };
}

export function parseArrival(raw?: string | null): Arrival | undefined {
  if (!raw) return undefined;
  try {
    const a = JSON.parse(raw) as Arrival;
    return typeof a.landing === "string" ? a : undefined;
  } catch {
    return undefined;
  }
}

/** One word for where they came from: the campaign source, else the referring site, else direct. */
export function arrivalSource(a?: { referrer?: string | null; utm?: Record<string, string> | null }): string {
  if (a?.utm?.source) return a.utm.source.toLowerCase();
  if (a?.referrer) {
    try {
      return new URL(a.referrer).host.replace(/^(www|m|l|lm)\./, "");
    } catch {
      return a.referrer;
    }
  }
  return "direct";
}
