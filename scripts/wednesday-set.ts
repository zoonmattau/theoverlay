// One post of the day's hand-picked set: three plays, the price we want, and
// one line on each. Reads the stored card so the prices and names are the ones
// the site published. Renders the same design at both Instagram sizes.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/wednesday-set.ts 2026-09-23
// Writes marketing/posts/<date>-wednesday-set/: set.png at 1080x1350,
// set-square.png at 1080x1080, set.html to open and tweak, and caption.md.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { readStoredCard } from "../src/lib/model/store";
import { callPrice } from "../src/lib/model/types";

const TITLE = "Wednesday";
// The set, in the order they jump. `line` is the one thing worth saying about it.
const PICKS: { raceId: string; tab: number; line: string }[] = [
  { raceId: "GEEL_230926_3", tab: 3, line: "Rates top of the field at 85.9 with the early speed to control it from barrier two." },
  { raceId: "W FM_230926_7", tab: 10, line: "Rates top of the field at 91.6 with the best closing sectionals, and needs luck from the back." },
  { raceId: "GEEL_230926_8", tab: 8, line: "Rates top of the field at 93.1, clear of the next on our figures." },
];

// The square is the portrait design with its type and spacing scaled down, so
// the two read as one post rather than two layouts.
const FORMATS = [
  { name: "set", height: 1350, scale: 1, padTop: 76, padBottom: 170, footBottom: 66 },
  { name: "set-square", height: 1080, scale: 0.85, padTop: 64, padBottom: 142, footBottom: 56 },
];

void (async () => {
  const date = process.argv[2] ?? "2026-09-23";
  const stored = await readStoredCard(date);
  if (!stored) throw new Error(`no card for ${date}`);

  const money = (n?: number) => (n ? `$${n.toFixed(2)}` : "—");
  const day = new Date(`${date}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  const plays = PICKS.map((p) => {
    const meeting = stored.card.meetings.find((m) => m.races.some((r) => r.raceId === p.raceId));
    const race = meeting?.races.find((r) => r.raceId === p.raceId);
    const x = race?.runners.find((r) => r.tabNumber === p.tab);
    if (!meeting || !race || !x) throw new Error(`not on the card: ${p.raceId} ${p.tab}`);
    if (x.scratched) throw new Error(`scratched: ${x.horseName}`);
    return {
      track: meeting.track,
      race: race.raceNumber,
      jump: race.jumpTime ? new Date(race.jumpTime).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" }) : "",
      tab: x.tabNumber,
      horse: x.horseName,
      live: money(callPrice(x) ?? x.marketPrice),
      rated: money(x.ratedPrice),
      prime: Boolean(x.prime),
      line: p.line,
    };
  });

  const data = { day, title: TITLE, plays };

  /** Every size the design carries, restated for one format at its scale. */
  const sheet = (f: (typeof FORMATS)[number]) => {
    const px = (n: number) => `${Math.round(n * f.scale)}px`;
    const s = `.${f.name}`;
    return `
${s} { width:1080px; height:${f.height}px; padding:${f.padTop}px 72px ${f.padBottom}px; }
${s} .kicker { font-size:${px(29)}; }
${s} h1 { font-size:${px(72)}; margin-top:${px(16)}; }
${s} .sub { font-size:${px(27)}; margin-top:${px(14)}; }
${s} .calls { margin-top:${px(28)}; gap:${px(16)}; }
${s} .call { padding:${px(26)} ${px(28)}; border-radius:${px(26)}; }
${s} .tagrow { gap:${px(15)}; }
${s} .tag { font-size:${px(24)}; padding:${px(5)} ${px(15)}; }
${s} .rno, ${s} .stake { font-size:${px(26)}; }
${s} .horse { font-size:${px(40)}; margin-top:${px(10)}; }
${s} .why { font-size:${px(25)}; margin-top:${px(9)}; }
${s} .prices { gap:${px(22)}; margin-top:${px(14)}; }
${s} .prices b { font-size:${px(36)}; }
${s} .prices span { font-size:${px(25)}; }
${s} .foot { bottom:${f.footBottom}px; }
${s} .logo { font-size:${px(46)}; }
${s} .tag2 { font-size:${px(27)}; }
`;
  };

  const STYLE = `
:root { --ink:#14161a; --panel:#fff; --soft:#f3f5ef; --line:#dfe3d8; --lime:#c4f000; --blue:#1668ff; --red:#e63023;
        --muted:#8a9080; --display:'Archivo',sans-serif; --mono:'IBM Plex Mono',monospace; }
* { box-sizing:border-box; margin:0; padding:0; }
body { background:#555; font-family:var(--display); color:var(--ink); }
.slide { position:relative; background:var(--soft); display:flex; flex-direction:column; overflow:hidden; margin-bottom:24px; }
.kicker { font-family:var(--mono); font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--muted); }
h1 { font-weight:800; line-height:.96; letter-spacing:-.03em; }
.mark { background:var(--lime); padding:0 16px; color:var(--ink); }
.sub { font-family:var(--mono); color:var(--muted); }
/* The cards take the space left between the title and the lockup and share
   it evenly, so a short set does not leave a hole above the footer. */
.calls { flex:1; display:flex; flex-direction:column; justify-content:space-between; }
.call { background:var(--panel); border:3px solid var(--line); }
.tagrow { display:flex; align-items:center; }
.tag { font-family:var(--mono); font-weight:800; letter-spacing:.12em; text-transform:uppercase;
       border-radius:999px; color:#fff; background:var(--blue); }
.tag.prime { background:var(--lime); color:var(--ink); }
.rno { font-family:var(--mono); color:var(--muted); font-weight:700; }
.stake { margin-left:auto; font-family:var(--mono); font-weight:700; color:var(--muted); }
.horse { font-weight:800; letter-spacing:-.02em; line-height:1.05; }
.why { line-height:1.35; color:#3d4147; }
.prices { display:flex; align-items:baseline; font-family:var(--mono); }
.prices b { font-weight:700; }
.prices span { color:var(--muted); font-weight:600; }
.foot { position:absolute; left:72px; right:72px; display:flex; align-items:center; gap:20px; }
.logo { font-weight:800; letter-spacing:-.02em; }
.logo em { font-style:normal; background:var(--lime); padding:0 12px; color:var(--ink); }
.tag2 { font-family:var(--mono); color:var(--muted); }
${FORMATS.map(sheet).join("")}`;

  const PAGE = `
const D = __DATA__;
const F = __FORMATS__;
const call = (c) =>
  '<div class="call">' +
    '<div class="tagrow"><span class="tag' + (c.prime ? ' prime' : '') + '">' + (c.prime ? 'Prime' : 'Bet') + '</span>' +
      '<span class="rno">' + c.track + ' R' + c.race + (c.jump ? ' \\u00b7 ' + c.jump : '') + '</span>' +
      '<span class="stake">1u</span></div>' +
    '<div class="horse">' + c.tab + '. ' + c.horse + '</div>' +
    '<div class="why">' + c.line + '</div>' +
    '<div class="prices"><b>' + c.live + '</b><span>we rate it ' + c.rated + '</span></div>' +
  '</div>';

document.body.innerHTML = F.map((f) =>
  '<div class="slide ' + f.name + '"><div class="kicker">' + D.day + '</div>' +
  '<h1>The ' + D.title + ' <span class="mark">Set.</span></h1>' +
  '<div class="sub">Three plays, one unit each.</div>' +
  '<div class="calls">' + D.plays.map(call).join('') + '</div>' +
  '<div class="foot"><span class="logo">THE <em>OVERLAY</em></span><span class="tag2">theoverlay.com.au</span></div>' +
  '</div>').join('');
`;

  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">' +
    `<style>${STYLE}</style></head><body></body>` +
    `<script>${PAGE.replace("__DATA__", JSON.stringify(data)).replace("__FORMATS__", JSON.stringify(FORMATS))}</script></html>`;

  const dir = `marketing/posts/${date}-wednesday-set`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/set.html`, html);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await page.goto(`file://${process.cwd().replace(/\\/g, "/")}/${dir}/set.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  for (const f of FORMATS) await page.locator(`.${f.name}`).screenshot({ path: `${dir}/${f.name}.png` });
  await browser.close();

  writeFileSync(
    `${dir}/caption.md`,
    `The ${TITLE} Set. Three plays, one unit each.\n\n` +
      plays.map((p) => `${p.track} R${p.race} ${p.tab}. ${p.horse} ${p.live} (we rate it ${p.rated})`).join("\n") +
      `\n\nEvery runner rated, every race, every day. theoverlay.com.au\n\n18+. Gamble responsibly.\n`,
  );

  for (const f of FORMATS) console.log(`${dir}/${f.name}.png at 1080x${f.height}`);
  for (const p of plays) console.log(`  ${p.track} R${p.race} ${p.tab}. ${p.horse} ${p.live} rated ${p.rated}`);
})();
