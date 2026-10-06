// Renders thumb.html into the two thumbnail variants, plus a 320x180 feed-size check of each. Run from the repo root.
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const dir = "marketing/youtube/2026-10-05-saturday-tempted/thumbnail";
const url = pathToFileURL(resolve(dir, "thumb.html")).href;
const b = await chromium.launch({ channel: "chrome" });
for (const v of ["a", "b"]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`${url}?show=${v}`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${dir}/thumbnail-${v}.png` });
  await p.close();
}
await b.close();
