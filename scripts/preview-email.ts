// Renders one transactional email to a file for a look. Run: npx tsx scripts/preview-email.ts
import { writeFileSync } from "node:fs";
import { EMAILS } from "../src/lib/email/messages";
import { renderEmail } from "../src/lib/email/template";
const { html } = renderEmail(EMAILS.trialStarted("Saturday + Wednesday", "Friday 18 September 2026"));
writeFileSync(process.argv[2] ?? "email-preview.html", html);
