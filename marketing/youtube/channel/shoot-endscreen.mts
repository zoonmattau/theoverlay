// Renders endscreen.html to endscreen.png (upload) and endscreen-guide.png (YouTube's spots labelled).
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
const url = pathToFileURL("marketing/youtube/channel/endscreen.html").href;
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(url, { waitUntil: "networkidle" });
await p.screenshot({ path: "marketing/youtube/channel/endscreen.png" });
await p.evaluate(() => document.body.classList.add("guide"));
await p.screenshot({ path: "marketing/youtube/channel/endscreen-guide.png" });
await b.close();
