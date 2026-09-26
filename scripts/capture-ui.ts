// Shoots the parts of the live app that the ads are built on.
//
// Two rules learned the hard way. Shoot narrow: a wide capture gets scaled down
// into an ad and the type dies, where a narrow one is scaled up and reads at a
// glance. And shoot few rows: a tall capture has to shrink to fit the ad's
// window, so six rows land bigger than twelve.
//
// Run the site first, with OVERLAY_OPEN=1 so the members' sections render:
//   OVERLAY_OPEN=1 npx next dev
//   npx tsx scripts/capture-ui.ts 2026-09-23 geelong-20260923 GEEL_230926_3
// SITE=https://theoverlay.com.au shoots production (gated sections will lock).
// Writes marketing/ads/shots/<name>.png at 2x.
import { chromium, type Locator, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";

const SITE = process.env.SITE ?? "http://localhost:3000";
// The bar, the next-to-go strip and the dev overlay stay out of every shot.
const HIDE = ".topbar, .ntg, nextjs-portal { display: none !important }";
const DIR = "marketing/ads/shots";

interface Opts {
  /** Hide the section's own header bar. It is dead height in a square ad. */
  bare?: boolean;
  /** Keep only the first n repeating rows, so the shot stays wide and short. */
  rows?: number;
  /** Shoot this inside the section instead of the whole thing. */
  within?: string;
  /** Override what counts as a row, when it is not a table or a bar. */
  rowSel?: string;
}

void (async () => {
  const [date = "2026-09-23", meetingId = "geelong-20260923", raceId = "GEEL_230926_3"] = process.argv.slice(2);
  const race = `${SITE}/racing/${date}/${encodeURIComponent(meetingId)}/${encodeURIComponent(raceId)}`;
  mkdirSync(DIR, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const open = async (url: string, width: number): Promise<Page> => {
    const page = await browser.newPage({ viewport: { width, height: 1400 }, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
    await page.addStyleTag({ content: HIDE });
    await page.waitForTimeout(800);
    return page;
  };
  const section = (page: Page, title: string) => page.locator(`section.section:has(h2:text-is("${title}"))`).first();

  /** A tab click leaves its tooltip open, which lands across the next shot. */
  const unhover = async (page: Page) => {
    await page.mouse.move(4, 4);
    await page.waitForTimeout(500);
  };

  const trim = (el: Locator, o: Opts) =>
    el.evaluate(
      (node, { bare, rows, rowSel }) => {
        if (bare) node.querySelector<HTMLElement>(".section-bar")?.style.setProperty("display", "none", "important");
        if (!rows) return;
        // Whichever of these the section actually uses to repeat a runner.
        for (const sel of [rowSel, "tbody tr", ".bar-row", ".runner-row", "tr", "[class*='row']", "article", "li"].filter(Boolean) as string[]) {
          const found = [...node.querySelectorAll<HTMLElement>(sel)];
          if (found.length > rows) {
            found.slice(rows).forEach((r) => r.style.setProperty("display", "none", "important"));
            return;
          }
        }
      },
      { bare: Boolean(o.bare), rows: o.rows ?? 0, rowSel: o.rowSel ?? null },
    );

  const shoot = async (page: Page, title: string, name: string, o: Opts = {}) => {
    const sec = section(page, title);
    if (!(await sec.count())) return console.log(`  - ${name}: no "${title}" section`);
    await trim(sec, o);
    const el = o.within ? sec.locator(o.within).first() : sec;
    if (!(await el.count())) return console.log(`  - ${name}: no "${o.within}" inside "${title}"`);
    await unhover(page);
    await el.screenshot({ path: `${DIR}/${name}.png` });
    // Put the bar back: it carries the tabs the next shot needs to click.
    await sec.evaluate((node) => node.querySelector<HTMLElement>(".section-bar")?.style.removeProperty("display"));
    console.log(`  + ${name}.png`);
  };

  console.log(race);
  let page = await open(race, 940);
  await shoot(page, "Our selections", "selections", { bare: true, rows: 2, rowSel: ".grid > *" });
  // One card on its own is the tighter crop for a square ad.
  await shoot(page, "Our selections", "selection-card", { within: ".grid > *" });
  await shoot(page, "What to watch", "watch");
  await page.close();

  // Only the matrix needs the wide column; all ten columns have to fit, and its
  // header is worth keeping because the tabs name the ten ratings.
  page = await open(race, 1220);
  const all = section(page, "Rankings").locator('[role="tab"]:text-is("All")').first();
  if (await all.count()) {
    await all.click();
    await page.waitForTimeout(700);
    await shoot(page, "Rankings", "matrix", { rows: 8 });
  }
  // The market table scrolls sideways in a narrow column and loses its last
  // column to the clip, so it is shot on the wide page where it all fits.
  await shoot(page, "Market", "market", { bare: true, rows: 6 });
  await page.close();

  page = await open(race, 560);
  await shoot(page, "Rankings", "rankings", { bare: true, rows: 6 });
  for (const [label, name] of [["Pressure", "rankings-pressure"], ["Tempo", "rankings-tempo"], ["Late", "rankings-late"]] as const) {
    const tab = section(page, "Rankings").locator(`[role="tab"]:text-is("${label}")`).first();
    if (!(await tab.count())) { console.log(`  - ${name}: no "${label}" tab`); continue; }
    await tab.click();
    await page.waitForTimeout(700);
    await shoot(page, "Rankings", name, { bare: true, rows: 6 });
  }
  await page.close();

  // The speed map is shot narrow on purpose. Wide, it is a 3.6:1 letterbox that
  // dies in a square ad; at phone width it drops the names and becomes the
  // graphic it wants to be, with the bet and the lay carrying the colour.
  page = await open(race, 520);
  await shoot(page, "Speed map", "speedmap");
  await page.close();

  page = await open(`${SITE}/tips`, 1180);
  await shoot(page, "Lays", "lays", { bare: true, rows: 6 });
  await shoot(page, "Bets", "bets", { bare: true, rows: 4 });
  await page.close();

  // The home board: every race on the card, coloured by the call. At phone
  // width the meetings stack into a column too tall to read once it is scaled
  // into an ad; at this width the grid stays wide and short.
  page = await open(SITE, 900);
  const board = page.locator(".matrix-wrap").first();
  if (await board.count()) {
    await board.screenshot({ path: `${DIR}/home-board.png` });
    console.log("  + home-board.png");
  } else console.log("  - home-board: no .matrix-wrap");
  await page.close();

  // A tipster's page: their calls today and their record before today.
  page = await open(`${SITE}/t/MATT`, 560);
  await shoot(page, "Matt's tips", "tipster", { bare: true, rows: 2 });
  await shoot(page, "Every call before today", "tipster-record", { bare: true, rows: 5 });
  await page.close();

  await browser.close();
  console.log(`${DIR}/`);
})();
