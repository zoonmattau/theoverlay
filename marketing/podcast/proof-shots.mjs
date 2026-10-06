// Proof shots for the Instagram clips: the real site at phone width (390px, 3x), cropped to the one thing being said,
// with that thing ringed and the rest dimmed. Reads <ep>/video/proofs.json:
//   { "shots": [{ "name", "url", "click"?: [selectors], "from", "to"?, "ring"?: [selectors], "pad"? }] }
// "from"/"to" span one element's top to another's bottom; "ring" outlines the elements that prove the point.
// node marketing/podcast/proof-shots.mjs marketing/podcast/ep1 [name]   (SITE= another server; needs OVERLAY_OPEN=1)
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const [ep, only] = process.argv.slice(2);
const SITE = process.env.SITE ?? "http://localhost:3000";
const cfg = JSON.parse(readFileSync(`${ep}/video/proofs.json`, "utf8"));
const out = `${ep}/video/proofs`;
mkdirSync(out, { recursive: true });
// Site chrome, the dev badge, admin bits and the factor chips (never public) stay out.
const HIDE = `.topbar, .site-head, .ntg, .launch-offer, .offer-bar, nextjs-portal, .tip-tap, .bookie-link, .flex-wrap:has(> .factor) { display: none !important }
  html { scroll-behavior: auto !important }
  .proof-ring { outline: 5px solid #ff2d55 !important; outline-offset: 3px; border-radius: 8px; position: relative; z-index: 5; box-shadow: 0 0 0 9999px rgba(10, 12, 16, .0); }`;

const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 390, height: 1600 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
let at = "";
for (const s of cfg.shots) {
  if (only && s.name !== only) continue;
  try {
  if (s.url !== at) {
    await p.goto(SITE + s.url, { waitUntil: "networkidle", timeout: 240000 });
    at = s.url;
    await p.addStyleTag({ content: HIDE });
    // No bookie named in anything public; the admin preview banner isn't what members see.
    await p.evaluate(() => {
      document.querySelectorAll(".pick-price .label").forEach((l) => { if (!/^(live|rated|lay|bet|prime|way overlay|market)$/i.test(l.textContent.trim())) l.textContent = "Live"; });
      document.querySelectorAll("div,p,section").forEach((e) => { if (e.children.length < 3 && /^Admin preview/.test(e.textContent.trim())) e.style.display = "none"; });
    });
    await p.waitForTimeout(800);
  }
  await p.evaluate(() => document.querySelectorAll(".proof-ring").forEach((e) => e.classList.remove("proof-ring")));
  for (const [sel, value] of s.select ?? []) {
    await p.locator(sel).first().selectOption(value).catch(() => console.log(s.name, "no select", sel));
    await p.waitForTimeout(900);
  }
  for (const c of s.click ?? []) {
    await p.locator(c).first().evaluate((e) => e.click()).catch(() => console.log(s.name, "no click", c));
    await p.waitForTimeout(900);
  }
  for (const r of s.ring ?? []) {
    const n = await p.locator(r).count();
    if (!n) console.log(s.name, "no ring", r);
    await p.locator(r).evaluateAll((els) => els.forEach((e) => e.classList.add("proof-ring")));
  }
  const top = p.locator(s.from).first();
  if (!(await top.count())) { console.log(s.name, "MISSING", s.from); continue; }
  await top.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const a = await top.boundingBox();
  const z = s.to ? await p.locator(s.to).first().boundingBox({ timeout: 8000 }) : a;
  if (!a || !z) { console.log(s.name, "MISSING box"); continue; }
  const pad = s.pad ?? 8;
  const y = Math.max(0, a.y - pad);
  await p.screenshot({ path: `${out}/${s.name}.png`, clip: { x: 0, y, width: 390, height: Math.min(1590, z.y + z.height - y + pad) } });
  console.log(s.name, Math.round(z.y + z.height - a.y));
  } catch (e) { console.log(s.name, "FAILED", String(e).split("\n")[0]); }
}
await b.close();
