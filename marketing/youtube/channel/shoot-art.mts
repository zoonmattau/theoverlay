// Renders art.html into the channel banner and profile picture, and the intro video's first two thumbnails (into its own folder).
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const dir = "marketing/youtube/channel";
const url = pathToFileURL(resolve(dir, "art.html")).href;
const jobs: [string, string, number, number][] = [
  ["banner", "banner.png", 2048, 1152],
  ["safe", "banner-safe-preview.png", 2048, 1152],
  ["profile", "profile.png", 800, 800],
  ["thumb-a", "../2026-10-05-how-the-overlay-works/thumbnail/thumbnail-a.png", 1280, 720],
  ["thumb-b", "../2026-10-05-how-the-overlay-works/thumbnail/thumbnail-b.png", 1280, 720],
];
const b = await chromium.launch({ channel: "chrome" });
for (const [show, file, w, h] of jobs) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`${url}?show=${show}`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${dir}/${file}`, clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
}
await b.close();
