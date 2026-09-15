/**
 * One email shell for everything we send: the graphite bar with the wordmark,
 * a white card, a lime button. Table layout and inline styles because that
 * is what Gmail and Outlook actually render. Copy rule as on the site: one
 * sentence per line, no em dashes.
 */

import { BRAND_SOCIAL } from "@/lib/social";

export interface EmailSpec {
  /** Subject line and the <title>. */
  subject: string;
  /** Shown next to the subject in the inbox preview. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Small print under the button, e.g. "This link expires in an hour." */
  note?: string;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
const LOGO = "https://theoverlay.com.au/brand/lockup-dark.png";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderEmail(spec: EmailSpec): { html: string; text: string } {
  const paragraphs = spec.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font:400 15px ${FONT};color:#454a44;line-height:1.6">${p}</p>`,
    )
    .join("\n");

  const button = spec.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px">
  <tr>
    <td bgcolor="#c6f24e" style="background-color:#c6f24e;border-radius:8px">
      <a href="${spec.cta.url}" style="display:inline-block;padding:12px 22px;font:700 15px ${FONT};color:#14161a;text-decoration:none">${esc(spec.cta.label)}</a>
    </td>
  </tr>
</table>
<p style="margin:10px 0 0;font:400 12px ${FONT};color:#8b918a;line-height:1.5">If the button does not work, paste this into your browser:<br><a href="${spec.cta.url}" style="color:#1f6fd6;word-break:break-all">${spec.cta.url}</a></p>`
    : "";

  const note = spec.note
    ? `<p style="margin:18px 0 0;font:400 12px ${FONT};color:#8b918a;line-height:1.5">${spec.note}</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(spec.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f0">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(spec.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f0" style="background-color:#f3f4f0;margin:0;padding:0">
  <tr>
    <td align="center" style="padding:28px 12px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%">
        <tr>
          <td bgcolor="#14161a" style="background-color:#14161a;border-radius:10px 10px 0 0;padding:16px 22px">
            <a href="${SITE}" style="text-decoration:none">
              <img src="${LOGO}" alt="The Overlay" width="150" height="auto" style="display:block;width:150px;height:auto;border:0;font:800 20px ${FONT};color:#f5f7f2">
            </a>
          </td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #dfe3db;border-top:0;border-radius:0 0 10px 10px;padding:26px 24px">
            <h1 style="margin:0 0 14px;font:800 22px ${FONT};color:#14161a;line-height:1.25">${esc(spec.heading)}</h1>
            ${paragraphs}
            ${button}
            ${note}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 6px 0">
            <p style="margin:0;font:400 11px ${FONT};color:#8b918a;line-height:1.6">
              The Overlay publishes opinion and statistical analysis, not financial advice, and no outcome is guaranteed.
              18+ only. Gamble responsibly. Gambling Help Online 1800 858 858.
              <br>Questions: <a href="mailto:hello@theoverlay.com.au" style="color:#454a44">hello@theoverlay.com.au</a>
              <br><a href="${BRAND_SOCIAL.discord}" style="color:#454a44">Discord</a> &middot; <a href="https://instagram.com/${BRAND_SOCIAL.instagram}" style="color:#454a44">Instagram</a> &middot; <a href="https://x.com/${BRAND_SOCIAL.twitter}" style="color:#454a44">X</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    spec.heading,
    "",
    ...spec.paragraphs.map((p) => p.replace(/<[^>]+>/g, "")),
    ...(spec.cta ? ["", `${spec.cta.label}: ${spec.cta.url}`] : []),
    ...(spec.note ? ["", spec.note] : []),
    "",
    "The Overlay. 18+ only. Gamble responsibly. Gambling Help Online 1800 858 858.",
  ].join("\n");

  return { html, text };
}
