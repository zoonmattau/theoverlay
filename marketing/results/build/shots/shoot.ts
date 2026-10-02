// Screenshots the home page Results section at desktop and phone width.
//   npx tsx marketing/results/build/shots/shoot.ts [tag]
import { chromium } from "playwright-core";
(async () => {
  const tag = process.argv[2] ?? "now";
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const [name, width] of [["desktop", 1280], ["phone", 400]] as const) {
    const page = await browser.newPage({ viewport: { width, height: 1200 }, deviceScaleFactor: 1 });
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 180_000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
    const s = page.locator("section.section:has(h2:text-is(\"Results\"))").first();
    if (!(await s.count())) { console.log(name, "no Results section"); continue; }
    await s.screenshot({ path: `marketing/results/build/shots/${tag}-${name}.png` });
    const week = s.getByRole("tab", { name: "Last 7 days" });
    if (await week.count()) {
      await week.click();
      await page.waitForTimeout(400);
      await s.screenshot({ path: `marketing/results/build/shots/${tag}-${name}-week.png` });
    }
    console.log(name, "ok");
  }
  await browser.close();
})();
