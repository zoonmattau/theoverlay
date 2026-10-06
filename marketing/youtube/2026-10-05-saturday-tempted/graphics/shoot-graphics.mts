// Shoots each 1920x1080 section of graphics.html to its numbered PNG. Run from the repo root.
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const DIR = "marketing/youtube/2026-10-05-saturday-tempted/graphics";
const NAMES: Record<string, string> = {
  g01: "01-headline-best-day", g02: "02-day-in-numbers-and-winners", g03: "03-site-bets-seven-winners", g04: "04-site-bodmin-moor", g04b: "04b-site-bodmin-why",
  g05: "05-site-shadow-eagle-easy-love", g06: "06-lays", g07: "07-keep-it-honest", g08: "08-site-tempted-result",
  g09: "09-site-tempted-rating-and-price", g10: "10-site-speed-map-what-to-watch", g11: "11-tempted-sectionals", g12: "12-close",
};
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(pathToFileURL(resolve(DIR, "graphics.html")).href, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
for (const [id, name] of Object.entries(NAMES).filter(([id]) => !process.argv[2] || process.argv[2].split(",").includes(id))) await p.locator(`#${id}`).screenshot({ path: `${DIR}/${name}.png` });
await b.close();
