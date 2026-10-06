// Logs a headless browser in (one-time link, no email) and shoots exactly the site parts the video talks over,
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

// Tips page, 3 Oct: the header tiles, the Bets head, and each winner's row.
await open("/tips?date=2026-10-03");
await p.locator("h1", { hasText: "Today's tips" }).locator("xpath=..").screenshot({ path: `${OUT}/tips-head.png` });
await sec(/^Bets/).locator("thead").first().screenshot({ path: `${OUT}/bets-thead.png` });
for (const [i, horse] of ["Bodmin Moor", "Shadow Eagle", "Easy Love", "Liberty Park", "Aratiri", "Saintly Dancer", "Our Degree"].entries())
  await sec(/^Bets/).locator("tr.tip-row", { hasText: horse }).first().screenshot({ path: `${OUT}/win-${i + 1}.png` });

// Tempted's race page.
await open("/racing/2026-10-03/randwick-20261003/RAND_031026_9");
for (const [id, t] of [["results", /^Results/], ["rankings", /^Rankings/], ["pace", /^Speed map/], ["watch", /^What to watch/]] as const) await sec(t).screenshot({ path: `${OUT}/tempted-${id}.png` });
await shot(p, "header.section", "tempted-head");

// The rankings again at a narrower width, so the names and the ratings read larger once zoomed.
await p.setViewportSize({ width: 960, height: 900 });
await open("/racing/2026-10-03/randwick-20261003/RAND_031026_9");
await sec(/^Rankings/).screenshot({ path: `${OUT}/tempted-rankings-narrow.png` });
await p.setViewportSize({ width: 1440, height: 900 });

// Three winners' race pages: the result.
for (const [name, path] of [["bodmin", "/racing/2026-10-03/gold-coast-20261003/GCST_031026_1"], ["shadow", "/racing/2026-10-03/murray-bridge-gh-20261003/MUBR_031026_4"], ["easylove", "/racing/2026-10-03/eagle-farm-20261003/E%20FM_031026_6"]]) {
  await open(path);
  await shot(p, "header.section", `${name}-head`);
  await sec(/^Results/).screenshot({ path: `${OUT}/${name}-results.png` });
}
await b.close();
