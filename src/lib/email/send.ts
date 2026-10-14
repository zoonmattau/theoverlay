import "server-only";

import { renderEmail, type EmailSpec } from "./template";

const SITES = [...new Set(["https://theoverlay.com.au", process.env.NEXT_PUBLIC_SITE_URL].filter(Boolean) as string[])];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SITE_LINK = new RegExp(`(?:${SITES.map(escape).join("|")})(?:/[^\\s"'<>]*)?`, "g");

/**
 * Every link to the site carries utm_source=email and the email's campaign, so a click
 * lands in page_view events as a visit from that email (14 Oct 2026). Sign-in, sign-up
 * confirmation and unsubscribe links (/auth, /api) and anything already tagged are left alone.
 */
export function tagLinks(body: string, campaign = "email"): string {
  return body.replace(SITE_LINK, (url) => {
    const decoded = url.replace(/&amp;/g, "&");
    const u = new URL(decoded);
    if (/^\/(auth|api)\//.test(u.pathname) || /\.[a-z0-9]{2,4}$/i.test(u.pathname) || u.searchParams.has("utm_source")) return url;
    u.searchParams.set("utm_source", "email");
    u.searchParams.set("utm_medium", "email");
    u.searchParams.set("utm_campaign", campaign);
    const out = u.toString();
    return url.includes("&amp;") ? out.replace(/&/g, "&amp;") : out;
  });
}

/**
 * Sends one email through Resend, a single POST with no SDK. It never
 * throws: every caller is doing something more important than sending an
 * email (granting access after a payment), so a provider outage is logged
 * and swallowed.
 */
export async function sendEmail(to: string, spec: EmailSpec, headers?: Record<string, string>): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "The Overlay <hello@theoverlay.com.au>";
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set, skipped:", spec.subject, "to", to);
    return false;
  }
  const rendered = renderEmail(spec);
  const html = tagLinks(rendered.html, spec.campaign);
  const text = tagLinks(rendered.text, spec.campaign);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject: spec.subject, html, text, ...(headers ? { headers } : {}) }),
    });
    if (!res.ok) console.error("[email] resend", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("[email] failed", err);
    return false;
  }
}
