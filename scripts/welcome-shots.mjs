// Phone screenshots of the live app for the /welcome landing page, from the day's free race.
// Run the site with races open (OVERLAY_OPEN=1 npx next dev), then:  node scripts/welcome-shots.mjs racing/<date>/<meetingId>/<raceId>
// Writes public/welcome/<name>.png at 2x, 390 wide, and call.json for the top card. Re-shoot when the race page changes.
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const SITE = process.env.SITE ?? "http://localhost:3000";
// Git Bash rewrites a leading slash into a Windows path, so take the path from "racing/" on.
const race = "/" + (process.argv[2] ?? "").slice(Math.max(0, (process.argv[2] ?? "").indexOf("racing/")));
if (race === "/") throw new Error("Pass the free race path.");
const HIDE = ".topbar, .ntg, .offer-bar, nextjs-portal { display: none !important }";
const b = await chromium.launch({ channel: "chrome" });
const open = async (path) => {
  const p = await b.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto(SITE + path, { waitUntil: "networkidle", timeout: 120000 });
  await p.addStyleTag({ content: HIDE });
  // No bookie named on the page an ad lands on: a price box labelled with one reads Live.
  await p.evaluate(() => document.querySelectorAll(".pick-price .label").forEach((l) => { if (!/^(live|rated|lay|bet|prime|way overlay|market)$/i.test(l.textContent.trim())) l.textContent = "Live"; }));
  await p.waitForTimeout(600);
  return p;
};
const section = (p, title) => p.locator(`section.section:has(> .section-bar h2:text-is("${title}"))`).first();
const shot = async (loc, name, maxH) => {
  await loc.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8));
  await loc.page().waitForTimeout(300);
  const box = await loc.boundingBox();
  if (!box) return console.log("missing", name);
  const page = loc.page();
  await page.screenshot({ path: `public/welcome/${name}.png`, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, maxH ?? box.height) } });
  console.log(name, Math.round(box.width), Math.round(Math.min(box.height, maxH ?? box.height)));
};
const p = await open(race);
// The call the page's top card reads out: the race's first bet, else its first lay, else its top pick.
const call = await p.evaluate(() => {
  const cards = [...document.querySelectorAll("article")].filter((a) => a.querySelector(".pick-name"));
  const card = cards.find((a) => a.querySelector(".badge-prime, .badge-back")) ?? cards.find((a) => a.querySelector(".badge-lay")) ?? cards[0];
  if (!card) return null;
  const [tab, ...name] = card.querySelector(".pick-name").textContent.trim().split(". ");
  const prices = [...card.querySelectorAll(".pick-price")].map((x) => Number((x.textContent.match(/\$([\d.]+)/) ?? [])[1]));
  const signal = card.querySelector(".badge-prime") ? "prime" : card.querySelector(".badge-back") ? "back" : card.querySelector(".badge-lay") ? "lay" : undefined;
  const race = document.title.match(/^(.+?) Race (\d+) .*?, \w+ (\d+ \w+) \d{4}/);
  return { tab: Number(tab), horse: name.join(". "), market: prices[0], rated: prices[1], signal, track: race?.[1], raceNumber: Number(race?.[2]), day: race?.[3] };
});
if (!call) throw new Error("No selections on that race: is the site running with OVERLAY_OPEN=1?");
writeFileSync("public/welcome/call.json", `${JSON.stringify(call, null, 1)}\n`);
console.log("call", call);
await shot(section(p, "Our selections"), "selections", 560);
await shot(section(p, "Rankings"), "rankings", 520);
await shot(section(p, "Speed map"), "speedmap");
await shot(section(p, "Market"), "market", 520);
const h = await open("/");
await shot(h.locator("#board .matrix-wrap"), "board", 640);
await b.close();
