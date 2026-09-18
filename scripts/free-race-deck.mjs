// Screenshots the free race page and composes an Instagram deck of square
// slides: the top four, the ratings bars with the colour-coded matrix, the
// speed map with At a glance, and the lay runner's card (or the top-rated
// runner when there is no lay). Uses the installed Chrome via playwright-core.
// node scripts/free-race-deck.mjs 2026-09-16 caulfield-heath-20260916 CAUH_160926_6 "Caulfield Heath R6" "1000m · BM78 · 4.05pm" [layTab]
// SITE=http://localhost:3000 shoots a local server (run it with OVERLAY_OPEN=1 so members' sections show);
// PILL="Posted 11am, won at $20" replaces the free-race pill for a results post.
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [date, meetingId, raceId, raceLabel, raceMeta, layTabArg] = process.argv.slice(2);
if (!raceId) throw new Error("Give date, meetingId, raceId, a race label and its meta line.");
const url = `${process.env.SITE ?? "https://theoverlay.com.au"}/racing/${date}/${meetingId}/${raceId}`;
const pill = process.env.PILL ?? "Free race today";
const dir = `marketing/posts/${date}-${process.env.PILL ? raceId : "free-race"}`;
mkdirSync(dir, { recursive: true });
// The bar, the strip and the dev tools badge stay out of the shot.
const hide = ".topbar, .ntg, nextjs-portal { display: none !important }";
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function open(width) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: hide });
  await page.waitForTimeout(700);
  return page;
}
const section = (page, title) => page.locator(`section.section:has(h2:text-is("${title}"))`).first();

const shots = {};
let page = await open(900);
shots.topFour = await section(page, "Our selections").screenshot();
shots.speedMap = await section(page, "Speed map").screenshot();
const glance = section(page, "At a glance");
await glance.locator(".section-bar").click();
await page.waitForTimeout(400);
shots.glance = await glance.screenshot();
await page.close();

page = await open(1120);
const rankings = section(page, "Rankings");
shots.bars = await rankings.screenshot();
await rankings.locator('[role="tab"][data-tip="Every category for every runner in one table."]').click();
await page.waitForTimeout(500);
shots.matrix = await rankings.screenshot();
// The runner card: the lay if there is one, else the top-rated runner.
const layTab = layTabArg ?? (await page.locator(".runner-row:has(.signal-lay), .runner-row:has-text('LAY')").first().getAttribute("id").catch(() => null))?.replace("runner-", "");
const tab = layTab ?? (await page.locator(".runner-row").first().getAttribute("id")).replace("runner-", "");
const row = page.locator(`#runner-${tab}`);
await row.scrollIntoViewIfNeeded();
await row.click();
await page.waitForTimeout(800);
const panel = row.locator("xpath=following-sibling::tr[1]");
const a = await row.boundingBox(), b = await panel.boundingBox(), sy = await page.evaluate(() => window.scrollY);
shots.runner = await page.screenshot({ clip: { x: a.x, y: a.y + sy, width: a.width, height: b.y + b.height - a.y }, fullPage: true });
const runnerName = (await row.locator("td").nth(1).innerText()).split("\n")[0].trim();
// The slide is named for what the row says, not for how the tab was chosen.
const isLay = /LAY/.test(await row.innerText());
await page.close();

const slides = [
  { imgs: [shots.topFour], title: "Our top four", sub: "Live price against our rated price, and why each one rates where it does." },
  { imgs: [shots.bars, shots.matrix], title: "The ratings", sub: "Every runner on the benchmark scale, and every category in one table: green above the field, red below." },
  { imgs: [shots.speedMap, shots.glance], title: "The speed map", sub: "Where each runner settles, what that does to the tempo, and the race at a glance." },
  { imgs: [shots.runner], title: isLay ? "The lay" : process.env.PILL ? "The winner" : "The top pick", sub: `${runnerName}: profile, sectionals against the field, what to expect, the last five runs and our call.` },
];
const data = (buf) => "data:image/png;base64," + buf.toString("base64");
for (const [i, s] of slides.entries()) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0 }
    body { width: 1080px; height: 1080px; background: #14161a; color: #f4f5f1; font-family: "Inter", "Segoe UI", system-ui, sans-serif; padding: 56px 56px 48px; display: flex; flex-direction: column; overflow: hidden }
    .brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: 26px }
    .mark { font-weight: 900; font-size: 30px; letter-spacing: -0.02em; color: #c6f24e }
    .free { background: #c6f24e; color: #14161a; font-weight: 800; font-size: 18px; letter-spacing: 0.06em; text-transform: uppercase; padding: 8px 14px; border-radius: 999px }
    h1 { font-size: 54px; font-weight: 900; letter-spacing: -0.03em; line-height: 1; margin-bottom: 12px }
    h1 span { color: #8b918a; font-weight: 700; font-size: 26px; letter-spacing: 0; margin-left: 14px; vertical-align: middle }
    .sub { font-size: 24px; line-height: 1.3; color: #c9cec4; margin-bottom: 26px; max-width: 900px }
    .stack { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 18px; align-items: center; justify-content: center }
    .stack img { max-width: 100%; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.5); border: 1px solid #2a2e33; flex: 0 1 auto; min-height: 0; object-fit: contain }
    .foot { display: flex; justify-content: space-between; align-items: baseline; margin-top: 26px; font-size: 21px; color: #8b918a }
    .foot b { color: #f4f5f1; font-weight: 800 }
    .foot .cta { color: #c6f24e; font-weight: 800 }
  </style></head><body>
    <div class="brand"><div class="mark">The Overlay</div><div class="free">${pill}</div></div>
    <h1>${s.title}<span>${i + 1} / ${slides.length}</span></h1>
    <div class="sub">${s.sub}</div>
    <div class="stack">${s.imgs.map((b) => `<img src="${data(b)}">`).join("")}</div>
    <div class="foot"><div><b>${raceLabel}</b> · ${raceMeta}</div><div class="cta">7-day free trial · theoverlay.com.au</div></div>
  </body></html>`;
  const p = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
  await p.setContent(html);
  await p.waitForTimeout(300);
  const file = `${dir}/slide-${i + 1}.png`;
  writeFileSync(file, await p.screenshot());
  await p.close();
  console.log(file);
}
await browser.close();
