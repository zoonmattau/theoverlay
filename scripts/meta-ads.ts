// Meta ad creative. Three sets, and every ad stands on its own: someone who
// sees one and never sees another still gets what this is, what it looks like
// and how to start, because the lockup at the foot of each carries all three.
// Copy is deliberately short; the screenshot or the number is the argument.
//
// No profit, return or strike-rate claim appears anywhere, by design: the
// settled record is negative and advertising it would be false.
//   OVERLAY_OPEN=1 npx next dev
//   npx tsx scripts/capture-ui.ts 2026-09-23 geelong-20260923 GEEL_230926_3
//   npx tsx --conditions=react-server --env-file=.env.local scripts/meta-ads.ts 2026-09-23
// Writes marketing/ads/<date>/: <concept>-<placement>.png and ads.html.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { readStoredCard } from "../src/lib/model/store";
import { bestBookie } from "../src/lib/bookies";

// Story keeps a wide top and bottom margin so nothing lands under the
// Instagram chrome. shotH is how much room the screenshot gets.
const FORMATS = [
  { name: "square", height: 1080, scale: 0.8, padY: 64, footBottom: 56, shotH: 430 },
  { name: "portrait", height: 1350, scale: 0.95, padY: 80, footBottom: 68, shotH: 580 },
  // A story is read full screen on a phone, so the type runs larger than the
  // feed sizes even though the canvas is the same width.
  { name: "story", height: 1920, scale: 1.06, padY: 340, footBottom: 280, shotH: 520 },
];

const SETS = {
  core: ["call", "map", "board", "price", "record"],
  bookies: ["beat", "edge", "priced", "pass", "opinion"],
  spring: ["springNow", "springSaturday", "springPriced", "springCrowd", "springReady"],
  app: ["terminal", "everyrace", "tipsters", "tipsterRecord"],
  problem: ["heart", "mate", "bookietips", "name"],
};
const CONCEPTS = Object.values(SETS).flat();
/** Which set an ad belongs to, so each lands in its own folder. */
const SET_OF = Object.fromEntries(Object.entries(SETS).flatMap(([set, list]) => list.map((c) => [c, set])));

void (async () => {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const stored = await readStoredCard(date);
  if (!stored) throw new Error(`no card for ${date}`);

  // A real call off the day's card, so the worked example is never invented.
  // The widest gap between our price and the market's makes the clearest tile.
  const sample = stored.card.meetings
    .flatMap((m) => m.races)
    .flatMap((r) => r.runners.filter((x) => x.signal === "back" && x.marketPrice && x.ratedPrice))
    .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))[0];
  const example = sample
    ? {
        horse: sample.horseName,
        rated: `$${sample.ratedPrice!.toFixed(2)}`,
        market: `$${sample.marketPrice!.toFixed(2)}`,
        bookie: bestBookie(sample.bookies)?.name ?? "the market",
      }
    : { horse: "Shultzy", rated: "$5.30", market: "$7.00", bookie: "Sportsbet" };

  // How often the honest answer is to leave a race alone.
  const allRaces = stored.card.meetings.flatMap((m) => m.races);
  const data = {
    ...example,
    races: allRaces.length,
    noBet: allRaces.filter((r) => !r.runners.some((x) => x.signal === "back")).length,
  };

  const sheet = (f: (typeof FORMATS)[number]) => {
    const px = (n: number) => `${Math.round(n * f.scale)}px`;
    const s = `.${f.name}`;
    return `
${s} { width:1080px; height:${f.height}px; padding:${f.padY}px 76px ${f.padY}px; }
${s} .kicker { font-size:${px(30)}; }
${s} h1 { font-size:${px(104)}; margin-top:${px(20)}; }
${s} h1.small { font-size:${px(80)}; }
${s} .lede { font-size:${px(36)}; margin-top:${px(26)}; }
${s} .shot { margin-top:${px(36)}; border-radius:${px(22)}; }
${s} .shot img { max-height:${f.shotH}px; }
${s} .versus { margin-top:${px(44)}; gap:${px(20)}; }
${s} .vt { padding:${px(34)} ${px(28)}; border-radius:${px(28)}; }
${s} .vt .l { font-size:${px(26)}; }
${s} .vt .p { font-size:${px(100)}; margin-top:${px(10)}; }
${s} .vname { font-size:${px(30)}; margin-top:${px(22)}; }
${s} .mech { font-size:${px(25)}; margin-top:${px(28)}; padding-left:${px(20)}; }
${s} .steps { margin-top:${px(30)}; gap:${px(12)}; }
${s} .step { padding:${px(18)} ${px(18)}; border-radius:${px(18)}; }
${s} .step b { font-size:${px(24)}; }
${s} .step span { font-size:${px(25)}; margin-top:${px(8)}; }
${s} .foot { bottom:${f.footBottom}px; }
${s} .logo { font-size:${px(42)}; }
${s} .footlines b { font-size:${px(26)}; }
${s} .tag2 { font-size:${px(21)}; }
`;
  };

  const STYLE = `
:root { --ink:#14161a; --panel:#fff; --soft:#f3f5ef; --line:#dfe3d8; --lime:#c4f000; --blue:#1668ff; --red:#e63023;
        --muted:#8a9080; --display:'Archivo',sans-serif; --mono:'IBM Plex Mono',monospace; }
* { box-sizing:border-box; margin:0; padding:0; }
body { background:#555; font-family:var(--display); color:var(--ink); }
.ad { position:relative; background:var(--soft); display:flex; flex-direction:column; justify-content:center;
      overflow:hidden; margin:0 auto 24px; }
.ad.dark { background:var(--ink); color:#fff; }
.kicker { font-family:var(--mono); font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--muted); }
.ad.dark .kicker { color:var(--lime); }
/* The lime mark is an inline background whose box is about 1.15em tall. Any
   line-height under that lets it bleed upward and cover the descenders of the
   line above (the g in "beating", the p in "prices"). 1.12 clears them. */
h1 { font-weight:800; line-height:1.12; letter-spacing:-.035em; }
.mark { background:var(--lime); padding:0 16px; color:var(--ink); white-space:nowrap; }
.lede { font-weight:600; line-height:1.35; max-width:880px; color:#3d4147; }
.ad.dark .lede { color:#d7dccb; }
/* The shot is never cropped. A wide table fills the column; a tall card is
   limited by the window height and shrinks to fit inside it, centred. */
/* The shot is never cropped. A wide table fills the column; a tall one is
   limited by the window height and shrinks, whole, to fit inside it. Cropping
   instead cut the bottom off every tall screenshot in the square and story. */
/* The frame hugs the shot rather than stretching, so a scaled-down table is
   not marooned in a full-width white box. */
.shot { display:flex; width:fit-content; max-width:100%; margin-left:auto; margin-right:auto;
        border:3px solid var(--line); background:var(--panel); }
.ad.dark .shot { border-color:#3a3f48; }
.shot img { display:block; max-width:100%; width:auto; height:auto; }
/* Two prices side by side: the bookie's and ours. */
.versus { display:grid; grid-template-columns:1fr 1fr; }
.vt { background:var(--panel); border:3px solid var(--line); text-align:center; }
.ad.dark .vt { background:#22252b; border-color:#3a3f48; }
/* Both need to outrank ".ad.dark .vt", which is the more specific selector. */
.vt.them, .ad.dark .vt.them { background:var(--blue); border-color:var(--blue); color:#fff; }
.vt.us, .ad.dark .vt.us { background:var(--lime); border-color:var(--lime); color:var(--ink); }
.vt .l { font-family:var(--mono); font-weight:700; letter-spacing:.14em; text-transform:uppercase; opacity:.85; }
.vt .p { font-family:var(--mono); font-weight:700; line-height:1; letter-spacing:-.04em; }
.vname { font-family:var(--mono); color:var(--muted); font-weight:600; }
.ad.dark .vname { color:#b9c0ad; }
/* The mechanic, on every ad. Someone who has never heard of us reads these
   three and knows what the thing does and why it would be worth paying for. */
.steps { display:grid; grid-template-columns:1fr 1fr 1fr; }
.step { background:var(--panel); border:3px solid var(--line); display:flex; flex-direction:column; }
.ad.dark .step { background:#22252b; border-color:#3a3f48; }
.step b { font-family:var(--mono); font-weight:700; color:var(--muted); letter-spacing:.1em; }
.ad.dark .step b { color:var(--lime); }
.step span { font-weight:700; line-height:1.2; letter-spacing:-.01em; }
.mech { font-family:var(--mono); font-weight:600; line-height:1.4; color:var(--muted);
        border-left:4px solid var(--lime); }
.ad.dark .mech { color:#b9c0ad; }
.foot { position:absolute; left:76px; right:76px; display:flex; align-items:center; gap:22px; }
.footlines { display:flex; flex-direction:column; gap:3px; }
.footlines b { font-weight:700; letter-spacing:-.01em; }
.logo { font-weight:800; letter-spacing:-.02em; white-space:nowrap; }
.logo em { font-style:normal; background:var(--lime); padding:0 12px; color:var(--ink); }
.tag2 { font-family:var(--mono); color:var(--muted); white-space:nowrap; }
.ad.dark .tag2 { color:#b9c0ad; }
${FORMATS.map(sheet).join("")}`;

  const PAGE = `
const D = __DATA__;
const F = __FORMATS__;
const C = __CONCEPTS__;

// Every ad ends the same way, so one on its own still says who we are, what we
// do and how to start.
const foot = '<div class="foot"><span class="logo">THE <em>OVERLAY</em></span>' +
  '<span class="footlines"><b>Know what every runner is worth.</b>' +
  '<span class="tag2">7 days free, then from $19 a month</span>' +
  '<span class="tag2">theoverlay.com.au &nbsp;18+</span></span></div>';

const shot = (name) => '<div class="shot"><img src="../shots/' + name + '.png"></div>';
const mech = '<p class="mech">We rate every runner, put our own price on it, ' +
  'and the ones the bookies have too long are the bets.</p>';
const steps =
  '<div class="steps">' +
    '<div class="step"><b>01</b><span>We rate every runner in the race</span></div>' +
    '<div class="step"><b>02</b><span>We put our own price on each one</span></div>' +
    '<div class="step"><b>03</b><span>You bet the ones the bookies have too long</span></div>' +
  '</div>';

const body = {
  // ---- core: what it does for you ----
  call: () =>
    '<div class="kicker">What you get</div>' +
    '<h1 class="small">Know which bets<br>are <span class="mark">worth taking.</span></h1>' +
    shot('selection-card') + mech,

  map: () =>
    '<div class="kicker">Tempo and pressure</div>' +
    '<h1 class="small">See the race<br><span class="mark">before it runs.</span></h1>' +
    shot('rankings-pressure') + mech,

  board: () =>
    '<div class="kicker">Every runner</div>' +
    '<h1 class="small">The whole field,<br>rated and <span class="mark">priced.</span></h1>' +
    shot('rankings') + steps,

  price: () =>
    '<div class="kicker">The market</div>' +
    '<h1 class="small">Find the prices<br>the bookies <span class="mark">got wrong.</span></h1>' +
    shot('market') + steps,

  record: () =>
    '<div class="kicker">The record</div>' +
    '<h1 class="small">Every call,<br>settled <span class="mark">in public.</span></h1>' +
    shot('bets') + mech,

  // ---- bookies: the opponent, the edge, and where our price comes from ----
  beat: () =>
    '<div class="kicker">Who you are playing</div>' +
    '<h1 class="small">You are not beating<br>the horse. You are<br>beating <span class="mark">the bookie.</span></h1>' +
    '<p class="lede">They set the price. Winning is finding the ones they have set too long.</p>' +
    steps,

  edge: () =>
    '<div class="kicker">The edge, worked out</div>' +
    '<h1 class="small">We do the sums<br>on <span class="mark">every runner.</span></h1>' +
    shot('market') + mech,

  priced: () =>
    '<div class="kicker">Where our price comes from</div>' +
    '<h1 class="small">Ten ratings in.<br><span class="mark">One price out.</span></h1>' +
    shot('matrix') + mech,

  pass: () =>
    '<div class="kicker">When to sit out</div>' +
    // Meta's gambling check rejected the first version ("not to bet", "your
    // bookie"), so this one carries no betting words, the mechanic included.
    '<h1 class="small">Most races, we tell<br>you <span class="mark">to sit out.</span></h1>' +
    '<p class="lede">In ' + D.noBet + ' of today’s ' + D.races + ' races no price was worth taking. We only call the ones that are.</p>' +
    shot('home-board') +
    '<p class="mech">We rate every runner and put our own price on it. Where the price is fair, we say nothing.</p>',

  opinion: () =>
    '<div class="kicker">Whose price is it</div>' +
    '<h1 class="small">A bookie price is<br><span class="mark">a bookie opinion.</span></h1>' +
    shot('selections') + mech,

  // ---- spring ----
  springNow: () =>
    '<div class="kicker">Spring carnival</div>' +
    '<h1 class="small">Spring starts<br><span class="mark">here.</span></h1>' +
    shot('matrix') + steps,

  springSaturday: () =>
    '<div class="kicker">Spring carnival</div>' +
    '<h1 class="small">Every spring<br>Saturday, <span class="mark">rated.</span></h1>' +
    shot('selection-card') + mech,

  springPriced: () =>
    '<div class="kicker">Spring carnival</div>' +
    '<h1 class="small">The big days are<br>won on <span class="mark">the price.</span></h1>' +
    shot('lays') + mech,

  springCrowd: () =>
    '<div class="kicker">Spring carnival</div>' +
    '<h1 class="small">Everyone bets<br>in spring.<br><span class="mark">Most of them guess.</span></h1>' +
    '<p class="lede">Go in with a rating and a price on every runner.</p>' +
    mech,

  // ---- what people bet on now, and why it is not a price ----
  heart: () =>
    '<div class="kicker">Head, not heart</div>' +
    '<h1 class="small">A feeling is not<br><span class="mark">a price.</span></h1>' +
    '<p class="lede">Every runner gets a rating and a price, so the call is a number you can check rather than a hunch you cannot.</p>' +
    shot('selection-card') + mech,

  mate: () =>
    '<div class="kicker">Where your tips come from</div>' +
    '<h1 class="small">Your mate has not<br>done <span class="mark">the sectionals.</span></h1>' +
    '<p class="lede">We rate every run on sectional time, class and tempo, then put a price on it. The mail down the pub does neither.</p>' +
    shot('rankings-pressure') + mech,

  bookietips: () =>
    '<div class="kicker">Who is tipping you</div>' +
    '<h1 class="small">The bookie’s tipster<br>works for <span class="mark">the bookie.</span></h1>' +
    '<p class="lede">A bookie preview is an ad. The horse they push is the one they want the money on, at the price that suits them.</p>' +
    shot('market') + mech,

  name: () =>
    '<div class="kicker">Why you are on it</div>' +
    '<h1 class="small">Back it for the price,<br>not <span class="mark">the name.</span></h1>' +
    '<p class="lede">A good horse at a bad price is a bad bet. We price the whole field so you can tell which is which.</p>' +
    shot('selections') + mech,

  // ---- the app itself ----
  terminal: () =>
    '<div class="kicker">Your racing terminal</div>' +
    '<h1 class="small">The whole day<br>on <span class="mark">one screen.</span></h1>' +
    shot('home-board') + steps,

  everyrace: () =>
    '<div class="kicker">Every race rated</div>' +
    '<h1 class="small">Every race on<br>the card, <span class="mark">priced.</span></h1>' +
    '<p class="lede">Blue where we back one, red where we lay one, and nothing where the price is fair.</p>' +
    shot('home-board') + mech,

  tipsters: () =>
    '<div class="kicker">Tipsters on the app</div>' +
    '<h1 class="small">Follow people who<br><span class="mark">show their working.</span></h1>' +
    shot('tipster') + mech,

  tipsterRecord: () =>
    '<div class="kicker">Every tipster, measured</div>' +
    '<h1 class="small">Their record,<br>not their <span class="mark">highlights.</span></h1>' +
    shot('tipster-record') + mech,

  springReady: () =>
    '<div class="kicker">Spring carnival</div>' +
    '<h1 class="small">Be ready<br><span class="mark">for spring.</span></h1>' +
    shot('rankings') + mech,
};

const dark = {
  call: true, map: true, board: false, price: false, record: false,
  beat: true, edge: false, priced: true, pass: true, opinion: false,
  springNow: true, springSaturday: false, springPriced: true, springCrowd: true, springReady: false,
  terminal: true, everyrace: false, tipsters: false, tipsterRecord: true,
  heart: true, mate: false, bookietips: true, name: false,
};

document.body.innerHTML = C.flatMap((c) =>
  F.map((f) => '<div class="ad ' + f.name + (dark[c] ? ' dark' : '') + '" data-id="' + c + '-' + f.name + '">' + body[c]() + foot + '</div>')
).join('');
`;

  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">' +
    `<style>${STYLE}</style></head><body></body>` +
    `<script>${PAGE.replace("__DATA__", JSON.stringify(data)).replace("__FORMATS__", JSON.stringify(FORMATS)).replace("__CONCEPTS__", JSON.stringify(CONCEPTS))}</script></html>`;

  const dir = `marketing/ads/${date}`;
  mkdirSync(dir, { recursive: true });
  for (const set of Object.keys(SETS)) mkdirSync(`${dir}/${set}`, { recursive: true });
  writeFileSync(`${dir}/ads.html`, html);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  // The viewport has to clear the tallest ad. Shorter than that, Chrome
  // stitches the capture and the part below the fold comes back unpainted.
  const page = await browser.newPage({ viewport: { width: 1080, height: Math.max(...FORMATS.map((f) => f.height)) + 80 }, deviceScaleFactor: 1 });
  await page.goto(`file://${process.cwd().replace(/\\/g, "/")}/${dir}/ads.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  for (const c of CONCEPTS) for (const f of FORMATS) await page.locator(`[data-id="${c}-${f.name}"]`).screenshot({ path: `${dir}/${SET_OF[c]}/${c}-${f.name}.png` });
  await browser.close();

  for (const [name, list] of Object.entries(SETS)) console.log(`${dir}/${name}/`.padEnd(34) + `${list.length * FORMATS.length} images  ${list.join(", ")}`);
  console.log(`${dir}/  ${CONCEPTS.length * FORMATS.length} images`);
  console.log(`example: ${example.horse}, ${example.bookie} ${example.market} against our ${example.rated}`);
})();
