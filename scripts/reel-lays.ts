// A 9:16 reel of the day's lays at one meeting, one at a time: the race as
// the site shows it with our horse picked out, its price against ours, and a
// line on why we would take it on. Made to go up before the races; the
// results follow at night (reel-slams.ts with LAYS=1).
//   OVERLAY_OPEN=1 OVERLAY_READONLY=1 npx next dev
//   npx tsx --conditions=react-server --env-file=.env.local scripts/reel-lays.ts 2026-10-02 moruya marketing/reels/2026-10-02-moruya-lays/reasons.json
// reasons.json maps a race number to the line said about its lay, in words a
// punter uses: { "1": "Our top pick, but $1.90 says it wins more than half the time." }.
// Writes reel.webm (1080x1920), a still per beat and shotlist.md beside it.
import { chromium } from "playwright-core";
import { readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { KNOWN_BOOKIES } from "../src/lib/bookies";
import { readStoredCard } from "../src/lib/model/store";

void (async () => {
  const [date, trackArg, reasonsFile] = process.argv.slice(2);
  if (!reasonsFile) throw new Error("Give a date, a track and the reasons file.");
  const reasons = JSON.parse(readFileSync(reasonsFile, "utf8")) as Record<string, string>;
  const dir = dirname(reasonsFile);
  const stored = await readStoredCard(date);
  if (!stored) throw new Error(`no card for ${date}`);
  const meeting = stored.card.meetings.find((m) => m.track.toLowerCase().includes(trackArg.toLowerCase()));
  if (!meeting) throw new Error(`no meeting matching "${trackArg}"`);

  const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" }).replace(" ", "") : "");
  const money = (n?: number) => (n ? `$${n.toFixed(2)}` : "");
  const pct = (n?: number) => (n ? `${Math.round(100 / n)}%` : "");
  const lays = meeting.races
    .map((r) => ({ r, x: r.runners.find((y) => y.signal === "lay" && !y.scratched) }))
    .filter((l): l is { r: (typeof meeting.races)[number]; x: NonNullable<(typeof l)["x"]> } => Boolean(l.x))
    .map(({ r, x }) => {
      const reason = reasons[String(r.raceNumber)];
      if (!reason) throw new Error(`no reason for R${r.raceNumber} in ${reasonsFile}`);
      return { id: r.raceId, number: r.raceNumber, jump: clock(r.jumpTime), horse: x.horseName, tab: x.tabNumber, market: money(x.marketPrice), rated: money(x.ratedPrice), marketPct: pct(x.marketPrice), ratedPct: pct(x.ratedPrice), reason };
    });
  if (lays.length === 0) throw new Error(`no lays at ${meeting.track} on ${date}`);
  const NUMBERS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
  const title = process.env.TITLE ?? `${NUMBERS[lays.length] ?? lays.length} we're laying at ${meeting.track} today`;

  // The race as a phone shows it, scrolled to our horse, with its row picked out.
  // No bookie is named on screen, same as the ads.
  const SITE = process.env.SITE ?? "http://localhost:3000";
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const l of lays) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    await page.goto(`${SITE}/racing/${date}/${meeting.meetingId}/${l.id}`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.addStyleTag({ content: "nextjs-portal, .ntg, .bookie-link, .topbar, header { display:none !important } tr.reel-pick { outline:5px solid #c4f000; outline-offset:-3px; } tr.reel-pick > td:first-child { box-shadow:inset 10px 0 0 #c4f000; }" });
    await page.evaluate((source) => {
      const re = new RegExp(source, "i");
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (re.test(n.textContent?.trim() ?? "")) n.textContent = "Live";
    }, new RegExp(`^(${KNOWN_BOOKIES.join("|")})$`, "i").source);
    const row = page.locator(`tr.runner-row:has-text("${l.horse}")`).first();
    if (!(await row.count())) throw new Error(`no row for ${l.horse} on R${l.number}`);
    await row.evaluate((el) => {
      el.classList.add("reel-pick");
      el.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(700);
    const box = (await row.boundingBox())!;
    // A window of the table around the horse: a few runners either side.
    const h = 300;
    const y = Math.max(0, Math.min(box.y + box.height / 2 - h / 2, 844 - h));
    await page.screenshot({ path: `${dir}/race-r${l.number}.png`, clip: { x: 0, y, width: 390, height: h } });
    await page.close();
    console.log(`  + race-r${l.number}.png  ${l.horse}`);
  }

  // Timeline in seconds: the title, each lay in turn, then the close.
  const TITLE = 2.2;
  const EACH = 3.6;
  const CLOSE = 4.5;
  const beats: { id: string; at: number; until: number; say: string }[] = [{ id: "0-title", at: 0, until: TITLE, say: title }];
  lays.forEach((l, i) => beats.push({ id: `${i + 1}-r${l.number}`, at: TITLE + i * EACH, until: TITLE + (i + 1) * EACH, say: `R${l.number} ${l.horse}: ${l.market} against our ${l.rated}. ${l.reason}` }));
  const closeAt = TITLE + lays.length * EACH;
  beats.push({ id: `${lays.length + 1}-close`, at: closeAt, until: closeAt + CLOSE, say: `all ${lays.length}, results tonight, theoverlay.com.au, 18+` });
  const total = closeAt + CLOSE;

  const anim = (name: string, at: number, dur: number) => `animation:${name} ${dur}s cubic-bezier(.2,.9,.25,1) ${at}s forwards;`;
  const STYLE = `
:root { --ink:#14161a; --lime:#c4f000; --soft:#b9c0ad; }
* { box-sizing:border-box; margin:0; padding:0; }
body { width:1080px; height:1920px; overflow:hidden; background:var(--ink); font-family:'Archivo',sans-serif; color:#fff; }
.layer { position:absolute; inset:0; opacity:0; background:var(--ink); }
.title { display:flex; flex-direction:column; justify-content:center; padding:0 90px 300px; }
.title h1 { font-weight:800; font-size:124px; line-height:1.02; letter-spacing:-.04em; }
.title h1 em { font-style:normal; color:var(--ink); background:var(--lime); padding:0 20px; }
.title p { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:36px; color:var(--soft); margin-top:40px; }
.head { position:absolute; left:80px; right:80px; top:120px; display:flex; align-items:center; gap:22px; }
.pill { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:32px; letter-spacing:.12em; background:var(--lime); color:var(--ink); border-radius:999px; padding:12px 26px; }
.where { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:34px; color:var(--soft); }
.count { margin-left:auto; font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:32px; color:var(--soft); }
.shot { position:absolute; left:40px; right:40px; top:230px; border-radius:28px; overflow:hidden; border:6px solid #2b3036; }
.shot img { width:100%; display:block; }
.panel { position:absolute; left:80px; right:80px; top:1060px; }
.horse { font-weight:800; font-size:84px; letter-spacing:-.035em; line-height:1.02; }
.prices { display:flex; gap:20px; margin-top:26px; }
.price { flex:1; border-radius:24px; padding:14px 0 18px; text-align:center; background:#1f2228; border:4px solid #33383f; }
.price.ours { border-color:var(--lime); }
.price i { display:block; font-style:normal; font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:26px; letter-spacing:.14em; color:var(--soft); }
.price b { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:64px; letter-spacing:-.03em; }
.price small { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:28px; color:var(--soft); margin-left:10px; }
.reason { margin-top:30px; font-weight:800; font-size:52px; line-height:1.12; letter-spacing:-.02em; color:var(--lime); }
.close { display:flex; flex-direction:column; justify-content:center; padding:0 80px 330px; }
.close .what { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:34px; letter-spacing:.16em; color:var(--soft); text-transform:uppercase; }
.close .rows { margin-top:28px; display:flex; flex-direction:column; gap:14px; }
.close .row { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:20px; padding:18px 26px; border-radius:22px; background:#1f2228; border:3px solid #33383f; }
.close .row b { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:28px; color:var(--soft); }
.close .row span { font-weight:800; font-size:44px; letter-spacing:-.02em; }
.close .row i { font-style:normal; font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:32px; color:var(--soft); }
.close .tonight { margin-top:44px; font-weight:800; font-size:110px; letter-spacing:-.045em; line-height:1; }
.close .tonight em { font-style:normal; color:var(--lime); }
.close .site { margin-top:30px; font-weight:800; font-size:76px; letter-spacing:-.04em; color:var(--ink); background:var(--lime); padding:4px 24px 10px; width:fit-content; }
.close .rg { margin-top:20px; font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:28px; color:var(--soft); }
@keyframes show { from { opacity:1; } to { opacity:1; } }
@keyframes rise { 0% { opacity:0; transform:translateY(60px); } 100% { opacity:1; transform:none; } }
@keyframes pop { 0% { opacity:0; transform:scale(.85); } 70% { opacity:1; transform:scale(1.03); } 100% { opacity:1; transform:none; } }
.layer > * { opacity:0; }
`;
  const body =
    `<div class="layer title" style="z-index:1;${anim("show", 0, TITLE)}">` +
    `<h1 style="${anim("rise", 0.1, 0.5)}">${title.replace(/laying/i, "<em>laying</em>")}</h1>` +
    `<p style="${anim("rise", 0.6, 0.5)}">Where the market is shorter than our price</p></div>` +
    lays
      .map((l, i) => {
        const at = TITLE + i * EACH;
        return (
          `<div class="layer" style="z-index:${i + 2};${anim("show", at, EACH)}">` +
          `<div class="head" style="${anim("rise", at, 0.35)}"><span class="pill">LAY</span><span class="where">${l.jump} · ${meeting.track} R${l.number}</span><span class="count">${i + 1} of ${lays.length}</span></div>` +
          `<div class="shot" style="${anim("rise", at + 0.1, 0.45)}"><img src="race-r${l.number}.png"></div>` +
          `<div class="panel" style="${anim("rise", at + 0.35, 0.45)}"><div class="horse">${l.tab}. ${l.horse}</div>` +
          `<div class="prices"><div class="price"><i>MARKET</i><b>${l.market}</b><small>${l.marketPct}</small></div><div class="price ours"><i>OURS</i><b>${l.rated}</b><small>${l.ratedPct}</small></div></div>` +
          `<div class="reason">${l.reason}</div></div></div>`
        );
      })
      .join("") +
    `<div class="layer close" style="z-index:${lays.length + 2};${anim("show", closeAt, CLOSE)}">` +
    `<div class="what" style="${anim("rise", closeAt + 0.05, 0.35)}">Today's ${lays.length} lays at ${meeting.track}</div>` +
    `<div class="rows" style="${anim("rise", closeAt + 0.2, 0.45)}">` +
    lays.map((l) => `<div class="row"><b>R${l.number}</b><span>${l.horse}</span><i>${l.market} · ours ${l.rated}</i></div>`).join("") +
    `</div><div class="tonight" style="${anim("pop", closeAt + 0.8, 0.4)}">Results <em>tonight.</em></div>` +
    `<div class="site" style="${anim("pop", closeAt + 1.3, 0.4)}">theoverlay.com.au</div>` +
    `<div class="rg" style="${anim("rise", closeAt + 1.6, 0.35)}">18+ · Gamble responsibly · 1800 858 858</div></div>`;
  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Mono:wght@600;700&display=swap" rel="stylesheet">' +
    `<style>${STYLE}</style></head><body>${body}` +
    `<script>window.__at = (s) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = s * 1000; });` +
    `window.__at(0);window.__run = () => document.getAnimations().forEach((a) => { a.currentTime = 0; a.play(); });</script></body></html>`;
  writeFileSync(`${dir}/reel.html`, html);
  const file = `file://${process.cwd().replace(/\\/g, "/")}/${dir}/reel.html`;

  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, recordVideo: { dir, size: { width: 1080, height: 1920 } } });
  const page = await ctx.newPage();
  await page.goto(file, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.evaluate(() => (window as unknown as { __run: () => void }).__run());
  await page.waitForTimeout(total * 1000 + 400);
  await ctx.close();
  for (const f of readdirSync(dir)) if (f.endsWith(".webm") && f !== "reel.webm") renameSync(`${dir}/${f}`, `${dir}/reel.webm`);

  for (const f of readdirSync(dir)) if (/^\d+-.*\.png$/.test(f)) unlinkSync(`${dir}/${f}`);
  const still = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await still.goto(file, { waitUntil: "networkidle" });
  await still.waitForTimeout(900);
  for (const b of beats) {
    await still.evaluate((s) => (window as unknown as { __at: (s: number) => void }).__at(s), b.until - 0.1);
    await still.waitForTimeout(300);
    await still.screenshot({ path: `${dir}/${b.id}.png` });
  }
  await browser.close();

  const mmss = (s: number) => `0:${s.toFixed(1).padStart(4, "0")}`;
  writeFileSync(
    `${dir}/shotlist.md`,
    `# ${title}, ${date}\n\n| in | out | still | on screen |\n|---|---|---|---|\n` +
      beats.map((b) => `| ${mmss(b.at)} | ${mmss(b.until)} | \`${b.id}.png\` | ${b.say} |`).join("\n") +
      `\n\n\`reel.webm\` is the whole ${total.toFixed(1)} seconds at 1080x1920.\n`,
  );
  console.log(`\n${dir}/reel.webm  (${total.toFixed(1)}s, 1080x1920), ${lays.length} lays`);
})();
