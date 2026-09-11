// Renders today's morning tips email from the stored card. Run: npx tsx scripts/preview-tips-email.ts out.html
import { writeFileSync } from "node:fs";
import { readStoredCard } from "../src/lib/model/store";
import { morningTipsEmail } from "../src/lib/email/tips";
import { renderEmail } from "../src/lib/email/template";
import { racingToday } from "../src/lib/model/source";

const date = process.argv[3] ?? racingToday();
readStoredCard(date).then((stored) => {
  if (!stored) throw new Error(`no stored card for ${date}`);
  const { html } = renderEmail(morningTipsEmail(date, stored.card, "00000000-0000-0000-0000-000000000000"));
  writeFileSync(process.argv[2] ?? "tips-preview.html", html);
});
