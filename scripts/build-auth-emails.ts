// Renders the Supabase auth email templates from the shared shell into
// supabase/templates/*.html. Paste each into Supabase > Auth > Email
// templates. Links go to our own /auth/confirm with the token hash, so the
// email never shows the Supabase hostname.
// Run: npx tsx scripts/build-auth-emails.ts
import { mkdirSync, writeFileSync } from "node:fs";

import { renderEmail, type EmailSpec } from "../src/lib/email/template";

const TEMPLATES: Record<string, EmailSpec & { subject: string }> = {
  "confirm-signup": {
    subject: "Confirm your account",
    preheader: "One click and you are in.",
    heading: "Confirm your account",
    paragraphs: [
      "Welcome to The Overlay.",
      "One click confirms your email and takes you straight to today's board.",
    ],
    cta: { label: "Confirm my account", url: "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&redirect_to={{ .RedirectTo }}" },
    note: "If you did not create an account, ignore this email and nothing happens.",
  },
  "magic-link": {
    subject: "Your login link",
    preheader: "Tap to log in, no password needed.",
    heading: "Log in to The Overlay",
    paragraphs: ["Here is your one-time login link."],
    cta: { label: "Log me in", url: "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&redirect_to={{ .RedirectTo }}" },
    note: "The link works once and expires in an hour.",
  },
  "reset-password": {
    subject: "Reset your password",
    preheader: "A link to choose a new password.",
    heading: "Reset your password",
    paragraphs: ["Someone asked to reset the password on this account, and if that was you, click below to choose a new one."],
    cta: { label: "Choose a new password", url: "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery" },
    note: "If it was not you, ignore this email and your password stays as it is.",
  },
  "change-email": {
    subject: "Confirm your new email",
    preheader: "Confirm the change to your account email.",
    heading: "Confirm your new email",
    paragraphs: ["Someone asked to change the email on your account to <strong>{{ .NewEmail }}</strong>, and clicking below confirms it."],
    cta: { label: "Confirm new email", url: "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change" },
    note: "If it was not you, ignore this email and nothing changes.",
  },
};

mkdirSync("supabase/templates", { recursive: true });
for (const [name, spec] of Object.entries(TEMPLATES)) {
  const { html } = renderEmail(spec);
  writeFileSync(`supabase/templates/${name}.html`, html);
  writeFileSync(`supabase/templates/${name}.subject.txt`, spec.subject);
  console.log("wrote", name);
}
