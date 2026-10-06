// Renders the two highlight covers (1080x1920) and a preview of each as Instagram shows it: a small circle.
// npx tsx marketing/posts/2026-10-05-overlays-underlays/shoot-highlight.mts
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const dir = "marketing/posts/2026-10-05-overlays-underlays";
const ffmpeg = "node_modules/ffmpeg-static/ffmpeg.exe";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto(pathToFileURL(resolve(dir, "highlight.html")).href, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
for (const v of ["a", "b"]) await p.locator(`#${v}`).screenshot({ path: `${dir}/highlight-${v}.png` });
await b.close();
// The circle a profile shows: the middle 1080 square, masked round, at 160px.
for (const v of ["a", "b"])
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", `${dir}/highlight-${v}.png`, "-vf", "crop=1080:1080:0:420,scale=160:160,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-80,Y-80),80),255,0)'", `${dir}/highlight-${v}-circle.png`]);
