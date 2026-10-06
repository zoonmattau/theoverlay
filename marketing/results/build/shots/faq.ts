import { chromium } from "playwright-core";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const [n, w] of [["d", 1280], ["p", 400]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto("http://localhost:3000/faq", { waitUntil: "networkidle", timeout: 180_000 });
    await page.addStyleTag({ content: "nextjs-portal { display:none !important }" });
    await page.locator("details").nth(4).evaluate((d) => ((d as HTMLDetailsElement).open = true));
    await page.screenshot({ path: `marketing/results/build/shots/faq-${n}.png`, fullPage: true });
  }
  await browser.close();
})();
