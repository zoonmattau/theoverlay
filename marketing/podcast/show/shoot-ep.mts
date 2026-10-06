// Episode art from thumbnail.html: the YouTube thumbnail (1280x720) and a square (1080x1080) for Instagram and Spotify.
// npx tsx marketing/podcast/show/shoot-ep.mts <out dir> <big> <small> <tag> <tag colour: red|lime> <box kicker> <box text> <ep>
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const [dir, big, small, tag, tagc, layk, lay, ep] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ channel: "chrome" });
for (const [name, w, h, square] of [["thumbnail", 1280, 720, ""], ["square", 1080, 1080, "1"]] as const) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`${pathToFileURL(resolve("marketing/podcast/show/thumbnail.html")).href}?${new URLSearchParams({ big, small, tag, tagc, layk, lay, ep, square })}`, { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.body.dataset.ready === "1");
  await p.screenshot({ path: `${dir}/${name}.png` });
  await p.close();
}
await b.close();
console.log(dir);
