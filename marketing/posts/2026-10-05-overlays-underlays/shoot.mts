// Renders slides.html into the five 1080x1350 carousel slides. npx tsx marketing/posts/2026-10-05-overlays-underlays/shoot.mts
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const dir = "marketing/posts/2026-10-05-overlays-underlays";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
await p.goto(pathToFileURL(resolve(dir, "slides.html")).href, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
for (let i = 1; i <= 5; i++) await p.locator(`#s${i}`).screenshot({ path: `${dir}/0${i}.png` });
await p.locator("#one").screenshot({ path: `${dir}/post.png` });
await p.locator("#two").screenshot({ path: `${dir}/post-b.png` });
await p.locator("#sq").screenshot({ path: `${dir}/post-square.png` });
await b.close();
