// Lists anything inside the webcam zone (x >= 1460, y >= 800) on each slide, and writes check/NN-zone.png with the zone outlined.
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
const DIR = "marketing/youtube/2026-10-05-saturday-tempted/graphics";
mkdirSync(`${DIR}/check`, { recursive: true });
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(pathToFileURL(resolve(DIR, "graphics.html")).href, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
const ids = await p.$$eval("section.s", (s) => s.map((x) => x.id));
for (const id of ids) {
  const hits = await p.evaluate((id) => {
    const sec = document.getElementById(id)!; const o = sec.getBoundingClientRect(); const out: string[] = [];
    for (const el of Array.from(sec.querySelectorAll("*")) as HTMLElement[]) {
      if (el.children.length && !(el instanceof HTMLImageElement) && !el.classList.contains("hl") && !el.classList.contains("win")) {
        // containers count only if they paint a box
        const cs = getComputedStyle(el); if (cs.backgroundColor === "rgba(0, 0, 0, 0)" && cs.borderTopWidth === "0px") continue;
      }
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const x2 = r.right - o.left, y2 = r.bottom - o.top;
      if (x2 > 1460 && y2 > 800) out.push(`${el.tagName.toLowerCase()}.${el.className || ""} ${Math.round(r.left - o.left)},${Math.round(r.top - o.top)}-${Math.round(x2)},${Math.round(y2)} "${(el.textContent || "").trim().slice(0, 30)}"`);
    }
    return out;
  }, id);
  console.log(id, hits.length ? "\n  " + hits.join("\n  ") : "clear");
  await p.evaluate((id) => { const z = document.createElement("div"); z.className = "zonebox"; z.style.cssText = "position:absolute;left:1460px;top:800px;width:460px;height:280px;outline:6px dashed #ff2d6f;background:rgba(255,45,111,.18);z-index:99"; document.getElementById(id)!.appendChild(z); }, id);
  await p.locator(`#${id}`).screenshot({ path: `${DIR}/check/${id.slice(1)}-zone.png` });
  await p.evaluate(() => document.querySelectorAll(".zonebox").forEach((z) => z.remove()));
}
await b.close();
