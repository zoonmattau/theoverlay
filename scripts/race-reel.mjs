// Records the free race page as a phone-shaped video for a reel: the top
// four, a slow scroll through the ratings and the speed map, then the market
// table with the lay runner opened and its Lay at price in view. Uses the
// installed Chrome via playwright-core and writes a .webm to drop into
// CapCut or the Reels editor (540x960, the phone layout; set it to fill the
// 9:16 frame). Also writes six crisp 1080x1920 stills of the same page for
// pan-and-zoom cuts: the top four, the rankings, the speed map, the lay
// runner's row and profile, its runs, and what to watch.
// node scripts/race-reel.mjs 2026-09-17 bunbury-20260917 BUNB_170926_5 7
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
const [date, meetingId, raceId, layTab] = process.argv.slice(2);
if (!raceId) throw new Error("Give date, meetingId, raceId and the lay runner's number.");
const url = `https://theoverlay.com.au/racing/${date}/${meetingId}/${raceId}`;
const dir = `marketing/posts/${date}-free-race`;
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
// A true phone layout needs a phone-sized viewport, and the video is the viewport, never scaled up: 540x960, set to fill in CapCut.
const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, recordVideo: { dir, size: { width: 540, height: 960 } } });
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.addStyleTag({ content: ".topbar, .ntg { display: none !important } html { scroll-behavior: auto }" });
const pause = (ms) => page.waitForTimeout(ms);
const glide = async (to, ms = 1600) => {
  const from = await page.evaluate(() => window.scrollY);
  const steps = Math.max(1, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) { const t = i / steps; const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; await page.evaluate((y) => window.scrollTo(0, y), from + (to - from) * e); await pause(16); }
};
const top = async (title) => page.locator(`section.section:has(h2:text-is("${title}"))`).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 12);
await pause(2500);                                  // the header and the top four
await glide(await top("Our selections"), 1400); await pause(4000);
await glide(await top("Rankings"), 1800); await pause(4000);
await glide(await top("Speed map"), 1800); await pause(3500);
await glide(await top("Market"), 1800); await pause(1500);
const row = page.locator(`#runner-${layTab}`);
if (await row.count()) {
  await row.scrollIntoViewIfNeeded(); await pause(800);
  await row.click(); await pause(1200);                // the lay runner opens
  await glide((await page.evaluate(() => window.scrollY)) + 380, 1600); await pause(3500);
  await glide((await page.evaluate(() => window.scrollY)) + 500, 1800); await pause(3500);
}
await glide(await top("What to watch"), 1800); await pause(3000);
await context.close();
// The stills, at two device pixels a CSS pixel.
const still = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
await still.goto(url, { waitUntil: "networkidle" });
await still.addStyleTag({ content: ".topbar, .ntg, .launch-offer { display: none !important } html { scroll-behavior: auto }" });
await still.waitForTimeout(1200);
const shot = async (name, y) => { await still.evaluate((v) => window.scrollTo(0, v), y); await still.waitForTimeout(500); await still.screenshot({ path: `${dir}/${name}.png` }); };
const at = async (title) => still.locator(`section.section:has(h2:text-is("${title}"))`).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 12);
await shot("1-top-four", 0);
await shot("2-rankings", await at("Rankings"));
await shot("3-speed-map", await at("Speed map"));
const r2 = still.locator(`#runner-${layTab}`);
if (await r2.count()) {
  await r2.scrollIntoViewIfNeeded(); await r2.click(); await still.waitForTimeout(1000);
  const y = await r2.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 12);
  await shot("4-lay-runner", y);
  await shot("5-runs", y + 900);
}
await shot("6-what-to-watch", await at("What to watch"));
await browser.close();
const webm = readdirSync(dir).find((f) => f.endsWith(".webm"));
if (webm) renameSync(`${dir}/${webm}`, `${dir}/reel.webm`);
console.log(`${dir}/reel.webm`);
