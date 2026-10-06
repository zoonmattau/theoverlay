// Logs in with a one-time link (no email sent) and shoots the Premiere Stakes race page for the intro thumbnail.
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { KNOWN_BOOKIES } from "../../../src/lib/bookies";
const SITE = "http://localhost:3000";
const email = process.env.ADMIN_EMAILS!.split(",")[0].trim();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const HIDE = ".topbar, .ntg, nextjs-portal, .bookie-link { display: none !important }";
const b = await chromium.launch({ channel: "chrome" });
const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
if (error) throw error;
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(`${SITE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/`, { waitUntil: "networkidle" });
await p.goto(`${SITE}/racing/2026-10-03/flemington-20261003/FLEM_031026_4`, { waitUntil: "networkidle" });
await p.addStyleTag({ content: HIDE });
// No bookie named anywhere in a marketing shot.
const re = new RegExp(`\b(${KNOWN_BOOKIES.join("|")})\b`, "gi");
await p.evaluate((src) => {
  const rx = new RegExp(src, "gi");
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (rx.test(n.textContent ?? "")) n.textContent = (n.textContent ?? "").replace(rx, "Market");
}, re.source);
await p.screenshot({ path: "marketing/youtube/2026-10-05-how-the-overlay-works/thumbnail/raw/race-full.png", fullPage: true });
const sel = ["table", ".runner-table", "[data-runners]"];
for (const s of sel) { const el = p.locator(s).first(); if (await el.count()) { await el.screenshot({ path: "marketing/youtube/2026-10-05-how-the-overlay-works/thumbnail/raw/race-table.png" }); console.log("table via", s); break; } }
await b.close();
