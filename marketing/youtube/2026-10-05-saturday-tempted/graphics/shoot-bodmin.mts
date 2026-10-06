// Shoots Bodmin Moor's race page for the "why $7.30" slide (logged in, 2x, faded rows forced to full strength).
// element by element at 2x, into raw/. Every tips row at full strength; no bookie links.
import { chromium, type Page } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
const SITE = "http://localhost:3000";
const OUT = "marketing/youtube/2026-10-05-saturday-tempted/graphics/raw";
const email = process.env.ADMIN_EMAILS!.split(",")[0].trim();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const CSS = ".topbar, .ntg, nextjs-portal, .bookie-link, .admin-only { display: none !important } tr.tip-row > td { opacity: 1 !important; filter: none !important; }";
const b = await chromium.launch({ channel: "chrome" });
const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
if (error) throw error;
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(`${SITE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/`, { waitUntil: "networkidle" });
async function open(path: string) { await p.goto(`${SITE}${path}`, { waitUntil: "networkidle" }); await p.addStyleTag({ content: CSS }); await p.waitForTimeout(600); }
const shot = (pg: Page, sel: string, name: string) => pg.locator(sel).first().screenshot({ path: `${OUT}/${name}.png` });
// A section by the start of its heading: sections carry no id in the DOM.
const sec = (title: RegExp) => p.locator("section.section").filter({ has: p.locator(".section-bar h2", { hasText: title }) }).first();

// Bodmin Moor, Gold Coast R1: why we had him at $7.30. His rankings line, his runner panel, the speed map and the top four.
await open("/racing/2026-10-03/gold-coast-20261003/GCST_031026_1");
await sec(/^Rankings/).screenshot({ path: `${OUT}/bodmin-rankings.png` });
await sec(/^Speed map/).screenshot({ path: `${OUT}/bodmin-pace.png` });
await sec(/^Our selections/).screenshot({ path: `${OUT}/bodmin-selections.png` }).catch(() => undefined);
// Open his row in the runner table: the panel with the sectionals, what to expect and our call.
const row = p.locator("tr.runner-row", { hasText: "Bodmin Moor" }).first();
await row.click();
await p.waitForTimeout(800);
await p.locator("tr.runner-row.is-open + tr").first().screenshot({ path: `${OUT}/bodmin-detail.png` });
await b.close();
