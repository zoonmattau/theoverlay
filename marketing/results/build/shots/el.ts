// Screenshots the first card whose heading matches, at desktop and phone width.
//   npx tsx marketing/results/build/shots/el.ts admin/money "New accounts" tag
import { chromium } from "playwright-core";
(async () => {
  const [path, heading, tag] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const [name, width] of [["desktop", 1280], ["phone", 400]] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`http://localhost:3000/${path}`, { waitUntil: "networkidle", timeout: 240_000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
    await page.locator(`.card:has(h2:text-is("${heading}"))`).first().screenshot({ path: `marketing/results/build/shots/${tag}-${name}.png` });
  }
  await browser.close();
})();
