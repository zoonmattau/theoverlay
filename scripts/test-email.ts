// Sends one real email through Resend to check the key and domain.
// Run: npx tsx scripts/test-email.ts you@example.com
import { readFileSync } from "node:fs";

import { EMAILS } from "../src/lib/email/messages";
import { renderEmail } from "../src/lib/email/template";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const [k, ...v] = l.split("=");
  if (k && v.length) process.env[k.trim()] ??= v.join("=").trim();
}

async function main() {
  const to = process.argv[2];
  if (!to) throw new Error("pass an address");
  const spec = EMAILS.trialStarted("Saturday + Wednesday", "Friday 18 September 2026");
  const { html, text } = renderEmail(spec);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject: `[test] ${spec.subject}`, html, text }),
  });
  console.log(res.status, await res.text());
}
main();
