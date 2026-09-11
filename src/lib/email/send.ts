import "server-only";

import { renderEmail, type EmailSpec } from "./template";

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
  const { html, text } = renderEmail(spec);
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
