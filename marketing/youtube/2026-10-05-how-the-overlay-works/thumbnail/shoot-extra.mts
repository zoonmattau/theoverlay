// Second screenshots for the thumbnail B variants: the results record and the race rankings. No bookie names.
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { KNOWN_BOOKIES } from "../../../src/lib/bookies";
const SITE = "http://localhost:3000";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await db.auth.admin.generateLink({ type: "magiclink", email: process.env.ADMIN_EMAILS!.split(",")[0].trim() });
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(`${SITE}/auth/confirm?token_hash=${data!.properties.hashed_token}&type=magiclink&next=/`, { waitUntil: "networkidle" });
const clean = async () => {
  await p.addStyleTag({ content: ".topbar, .ntg, nextjs-portal, .bookie-link { display: none !important }" });
  await p.evaluate((src) => { const rx = new RegExp(src, "gi"); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (rx.test(n.textContent ?? "")) n.textContent = (n.textContent ?? "").replace(rx, "Market"); }, `\b(${KNOWN_BOOKIES.join("|")})\b`);
};
await p.goto(`${SITE}/results`, { waitUntil: "networkidle" }); await clean();
await p.screenshot({ path: "marketing/youtube/2026-10-05-how-the-overlay-works/thumbnail/raw/results-full.png", fullPage: true });
console.log((await p.locator("body").innerText()).slice(0, 1500));
await p.goto(`${SITE}/racing/2026-10-03/flemington-20261003/FLEM_031026_4`, { waitUntil: "networkidle" }); await clean();
await p.screenshot({ path: "marketing/youtube/2026-10-05-how-the-overlay-works/thumbnail/raw/race-full.png", fullPage: true });
await b.close();
