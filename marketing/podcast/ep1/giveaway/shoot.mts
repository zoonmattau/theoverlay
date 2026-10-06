// Renders slides.html's five giveaway slides (1080x1350) and a contact sheet.
// npx tsx marketing/podcast/ep1/giveaway/shoot.mts
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const dir = "marketing/podcast/ep1/giveaway";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
for (let n = 1; n <= 5; n++) {
  await p.goto(`${pathToFileURL(resolve(`${dir}/slides.html`)).href}?slide=${n}`, { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.body.dataset.ready === "1");
  // Nothing may spill past the footer.
  const over = await p.evaluate(() => { const m = document.getElementById("main")!; return m.scrollHeight - m.clientHeight; });
  if (over > 2) console.log(`slide ${n} overflows by ${over}px`);
  await p.screenshot({ path: `${dir}/${n}.png` });
}
await b.close();
execFileSync("node_modules/ffmpeg-static/ffmpeg.exe", ["-v", "error", "-y", ...[1, 2, 3, 4, 5].flatMap((n) => ["-i", `${dir}/${n}.png`]),
  "-filter_complex", "[0]scale=540:-1[a];[1]scale=540:-1[b];[2]scale=540:-1[c];[3]scale=540:-1[d];[4]scale=540:-1[e];[a][b][c]hstack=3[t];[d][e]hstack=2,pad=1620:ih[u];[t][u]vstack", `${dir}/_sheet.png`]);
console.log(`${dir}: 5 slides`);
