// Full-page phone and desktop screenshots of an admin page.
//   npx tsx marketing/results/build/shots/shoot-admin.ts /admin/reports tag
import { chromium } from "playwright-core";
(async () => {
  const [path = "/admin/reports", tag = "admin"] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const [name, width] of [["phone", 400], ["desktop", 1280]] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:3000/${path.replace(/^\//, "")}`, { waitUntil: "networkidle", timeout: 240_000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
    await page.screenshot({ path: `marketing/results/build/shots/${tag}-${name}.png`, fullPage: true });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log(name, "ok, page width", wide);
  }
  await browser.close();
})();
