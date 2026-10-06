// Renders logo.html into the Overlays and Underlays show logo: each variant on the dark background (preview) and transparent (for the wipe).
// npx tsx marketing/youtube/show/shoot-logo.mts
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const dir = "marketing/youtube/show";
const url = pathToFileURL(resolve(dir, "logo.html")).href;
const b = await chromium.launch({ channel: "chrome" });
for (const v of (process.argv[2] ?? "a,b,c,d,e").split(",")) {
  for (const bg of ["dark", "clear"]) {
    const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
    await p.goto(`${url}?show=${v}&bg=${bg}`, { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForFunction(() => document.body.dataset.ready === "1" || !document.querySelector(".fit"));
    await p.screenshot({ path: `${dir}/logo-${v}${bg === "dark" ? "-preview" : ""}.png`, clip: { x: 0, y: 0, width: 1600, height: 900 }, omitBackground: bg === "clear" });
    await p.close();
  }
}
await b.close();
