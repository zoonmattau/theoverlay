// Renders wipe.html frame by frame (transparent) and encodes the OBS stinger: wipe.webm (VP9 with alpha) and wipe-preview.mp4 on dark.
// npx tsx marketing/youtube/show/shoot-wipe.mts
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
const dir = "marketing/youtube/show";
const frames = `${dir}/frames`;
const FPS = 60, D = 2.4;
const ffmpeg = "node_modules/ffmpeg-static/ffmpeg.exe";
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(pathToFileURL(resolve(dir, "wipe.html")).href, { waitUntil: "networkidle" });
await p.waitForFunction(() => document.body.dataset.ready === "1");
const n = Math.round(FPS * D);
for (let i = 0; i <= n; i++) {
  await p.evaluate((t) => (window as unknown as { at: (t: number) => void }).at(t), i / FPS);
  await p.screenshot({ path: `${frames}/${String(i).padStart(4, "0")}.png`, omitBackground: true });
}
await b.close();
execFileSync(ffmpeg, ["-y", "-framerate", String(FPS), "-i", `${frames}/%04d.png`, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "4M", "-auto-alt-ref", "0", `${dir}/wipe.webm`], { stdio: "inherit" });
execFileSync(ffmpeg, ["-y", "-f", "lavfi", "-i", `color=c=0x3b6ea8:s=1920x1080:r=${FPS}:d=${D}`, "-framerate", String(FPS), "-i", `${frames}/%04d.png`, "-filter_complex", "[0][1]overlay=format=auto", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", `${dir}/wipe-preview.mp4`], { stdio: "inherit" });
console.log(`${n + 1} frames, cut point ${1.2}s`);
