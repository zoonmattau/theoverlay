// A 9:16 reel cut to a voiceover, built from the card so every number on
// screen is the one the site is showing.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/reel.ts 2026-09-19 bowraville 3 1
// Writes marketing/reels/<date>-<track>-r<n>/: reel.webm (1080x1920), a still
// per beat, reel.html to open and tweak, and shotlist.md with the in and out
// of each beat for CapCut. Edit BEATS to move the timing.
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { readStoredCard } from "../src/lib/model/store";

void (async () => {

const [date, trackArg, raceArg, tabArg] = process.argv.slice(2);
if (!tabArg) throw new Error("Give a date, a track, a race number and the runner's number.");

const stored = await readStoredCard(date);
if (!stored) throw new Error(`no card for ${date}`);
const card = stored.card;
const meeting = card.meetings.find((m) => m.track.toLowerCase().includes(trackArg.toLowerCase()));
if (!meeting) throw new Error(`no meeting matching "${trackArg}" on ${date}`);
const race = meeting.races.find((r) => r.raceNumber === Number(raceArg));
if (!race) throw new Error(`no race ${raceArg} at ${meeting.track}`);
const live = race.runners.filter((r) => !r.scratched);
const me = live.find((r) => r.tabNumber === Number(tabArg));
if (!me) throw new Error(`no runner ${tabArg} in that race`);

const avg = (pick: (r: (typeof live)[number]) => number) => live.reduce((a, r) => a + pick(r), 0) / live.length;
const lateAvg = avg((r) => r.ratings.late);
const ranked = [...live].sort((a, b) => b.ratings.today - a.ratings.today);
const nextBest = ranked.find((r) => r.tabNumber !== me.tabNumber);
const lastRun = (me.runs ?? [])[0];
const money = (n?: number) => (n ? `$${n.toFixed(2)}` : "—");
const one = (n: number) => n.toFixed(1);

const groupOf = (r: { className?: string; name: string }) => {
  const m = `${r.className ?? ""} ${r.name}`.match(/group\s?([123])|\bg([123])\b/i);
  return m ? Number(m[1] ?? m[2]) : undefined;
};
const features = card.meetings
  .map((m) => ({ track: m.track, state: m.state, races: m.races.map((r) => ({ ...r, g: groupOf(r) })).filter((r) => r.g) }))
  .filter((m) => m.races.length > 0)
  .sort((a, b) => Math.min(...a.races.map((r) => r.g!)) - Math.min(...b.races.map((r) => r.g!)));

/** Each beat: where the voiceover lands, and what is on screen while it does. */
const BEATS = [
  { at: 0, until: 5, id: "1-today", scene: "today" },
  { at: 5, until: 10, id: "2-pick", scene: "pick" },
  { at: 10, until: 13, id: "3-late", scene: "late" },
  { at: 13, until: 18, id: "4-weight", scene: "weight" },
  { at: 18, until: 25, id: "5-price", scene: "price" },
  { at: 25, until: 31, id: "6-last", scene: "last" },
  { at: 31, until: 34, id: "7-class", scene: "class" },
  { at: 34, until: 40, id: "8-close", scene: "close" },
] as const;

const data = {
  beats: BEATS.map((b) => ({ at: b.at, until: b.until, scene: b.scene })),
  shots: [] as string[],
  features: features.slice(0, 2).map((m) => ({ track: m.track, state: m.state, races: m.races.map((r) => ({ n: r.raceNumber, g: r.g })) })),
  track: meeting.track,
  state: meeting.state,
  raceNumber: race.raceNumber,
  distance: race.distance,
  className: race.className ?? "",
  going: race.goingText ?? race.going,
  field: live.length,
  tab: me.tabNumber,
  horse: me.horseName,
  barrier: me.barrier,
  weight: me.weight ?? 0,
  map: me.ratings.map,
  today: one(me.ratings.today),
  late: one(me.ratings.late),
  lateAvg: one(lateAvg),
  lateGap: one(me.ratings.late - lateAvg),
  market: money(me.marketPrice),
  rated: money(me.ratedPrice),
  takeAbove: money(me.ratedPrice ? Math.round(me.ratedPrice * 1.03 * 20) / 20 : undefined),
  nextBestToday: nextBest ? one(nextBest.ratings.today) : "—",
  bars: ranked.slice(0, 5).map((r) => ({ tab: r.tabNumber, horse: r.horseName, today: r.ratings.today, me: r.tabNumber === me.tabNumber })),
  last: lastRun
    ? { track: lastRun.track ?? "", distance: lastRun.distance, className: lastRun.className ?? "", finish: lastRun.finish ?? 0, margin: lastRun.margin ?? 0, map: lastRun.map ?? "", points: one(lastRun.points) }
    : null,
};

const STYLE_MARKER = 1;
void STYLE_MARKER;
const STYLE = `
:root { --ink:#14161a; --panel:#fff; --soft:#f3f5ef; --line:#dfe3d8; --lime:#c4f000; --blue:#1668ff;
        --muted:#8a9080; --display:'Archivo',sans-serif; --mono:'IBM Plex Mono',monospace; }
* { box-sizing:border-box; margin:0; padding:0; }
body { width:1080px; height:1920px; overflow:hidden; background:var(--ink); font-family:var(--display); color:var(--ink); }
.stage { position:absolute; inset:0; overflow:hidden; }
.scene { position:absolute; inset:0; display:none; }
.scene.on { display:block; }
/* The slow push in: every scene drifts for its whole beat, so nothing sits still. */
.scene .zoom { position:absolute; inset:0; padding:150px 80px 240px; display:flex; flex-direction:column;
               justify-content:center; background:var(--soft); transform-origin:50% 45%; }
.scene.dark .zoom { background:var(--ink); color:#fff; }
.scene.on .zoom { animation: push var(--dur) linear both; }
.scene.on.out .zoom { animation: pull var(--dur) linear both; }
@keyframes push { from { transform:scale(1.00); } to { transform:scale(1.06); } }
@keyframes pull { from { transform:scale(1.06); } to { transform:scale(1.00); } }
/* Everything lands: the label first, the headline under it, the numbers last. */
.scene.on .in { animation: rise .55s cubic-bezier(.2,.8,.2,1) both; }
.scene.on .in.d1 { animation-delay:.10s; }
.scene.on .in.d2 { animation-delay:.22s; }
.scene.on .in.d3 { animation-delay:.36s; }
@keyframes rise { from { opacity:0; transform:translateY(46px); } to { opacity:1; transform:none; } }
.scene.on .pop { animation: pop .6s cubic-bezier(.2,1.4,.3,1) both; animation-delay:.3s; }
@keyframes pop { from { opacity:0; transform:scale(.72); } to { opacity:1; transform:scale(1); } }
.scene.on .fill { animation: grow .9s cubic-bezier(.2,.8,.2,1) both; animation-delay:.35s; }
.scene.on .t span { animation: grow 1s cubic-bezier(.2,.8,.2,1) both; animation-delay:.3s; }
@keyframes grow { from { transform:scaleX(0); } to { transform:scaleX(1); } }
.kicker { font-family:var(--mono); font-size:34px; font-weight:700; letter-spacing:.22em; text-transform:uppercase; color:var(--muted); }
.scene.dark .kicker { color:var(--lime); }
h1 { font-size:120px; font-weight:800; line-height:.96; letter-spacing:-.03em; margin-top:26px; }
h2 { font-size:84px; font-weight:800; line-height:1; letter-spacing:-.02em; }
.mark { background:var(--lime); padding:0 18px; color:var(--ink); }
.big { font-family:var(--mono); font-weight:700; font-size:310px; line-height:.9; letter-spacing:-.05em; }
.big small { font-size:104px; margin-left:26px; letter-spacing:0; }
.rows { margin-top:64px; display:flex; flex-direction:column; gap:26px; }
.trk { background:var(--panel); border:3px solid var(--line); border-radius:28px; padding:34px 40px; }
.trk .name { font-size:62px; font-weight:800; letter-spacing:-.02em; }
.trk .st { font-family:var(--mono); font-size:30px; color:var(--muted); margin-left:16px; }
.gs { display:flex; flex-wrap:wrap; gap:14px; margin-top:20px; }
.g { font-family:var(--mono); font-size:30px; font-weight:700; padding:8px 18px; border-radius:999px; background:var(--soft); border:2px solid var(--line); }
.g.g1 { background:var(--lime); border-color:var(--lime); }
.spacer { display:none; }
.runner { margin-top:44px; display:flex; align-items:center; gap:34px; }
.cloth { width:150px; height:150px; border-radius:50%; background:var(--ink); color:#fff; font-family:var(--mono);
         font-weight:700; font-size:86px; display:flex; align-items:center; justify-content:center; flex:none; }
.scene.dark .cloth { background:var(--lime); color:var(--ink); }
.meta { font-family:var(--mono); font-size:34px; color:var(--muted); margin-top:24px; line-height:1.5; }
.scene.dark .meta { color:#b9c0ad; }
.bar { margin-top:26px; }
.bar .lbl { font-family:var(--mono); font-size:30px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
.track { height:58px; border-radius:29px; background:#e7ebe0; margin-top:12px; overflow:hidden; }
.fill { height:100%; border-radius:29px; background:var(--lime); transform-origin:left center; }
.fill.dim { background:#c9cfbd; }
.num { font-family:var(--mono); font-weight:700; font-size:66px; letter-spacing:-.02em; margin-top:8px; }
.gap { font-family:var(--mono); font-weight:700; font-size:190px; color:var(--ink); letter-spacing:-.05em; line-height:.9; margin-top:56px; }
.prices { display:flex; gap:28px; margin-top:54px; }
.price { flex:1; min-width:0; border-radius:32px; padding:34px 20px; text-align:center; background:var(--panel); border:4px solid var(--line); }
.price.live { background:var(--blue); border-color:var(--blue); color:#fff; }
.scene.dark .price { background:#22252b; border-color:#3a3f48; color:#fff; }
.scene.dark .price.live { background:var(--blue); border-color:var(--blue); }
.price .k { font-family:var(--mono); font-size:30px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; opacity:.7; }
.price .v { font-family:var(--mono); font-size:112px; font-weight:700; letter-spacing:-.04em; line-height:1.1; }
.note { font-size:50px; font-weight:600; line-height:1.3; margin-top:42px; }
.barlist { margin-top:56px; display:flex; flex-direction:column; gap:22px; }
.row { display:flex; align-items:center; gap:22px; }
.row .who { font-family:var(--mono); font-size:31px; width:340px; flex:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.row .t { flex:1; height:46px; border-radius:23px; background:#e7ebe0; overflow:hidden; }
.row .t span { display:block; height:100%; background:#c9cfbd; border-radius:23px; transform-origin:left center; }
.row.me .t span { background:var(--lime); }
.row .v { font-family:var(--mono); font-weight:700; font-size:40px; width:118px; text-align:right; }
.shot { margin-top:40px; border-radius:30px; overflow:hidden; border:3px solid var(--line);
        box-shadow:0 30px 70px rgba(20,22,26,.16); background:var(--panel); }
.shot img { display:block; width:100%; }
.scene.dark .shot { border-color:#3a3f48; box-shadow:0 30px 70px rgba(0,0,0,.5); }
.scene.on .shot { animation: liftin .7s cubic-bezier(.2,.8,.2,1) both; animation-delay:.18s; }
@keyframes liftin { from { opacity:0; transform:translateY(64px) scale(.97); } to { opacity:1; transform:none; } }
/* A number laid over the shot, so the claim and the proof are one picture. */
.over { position:relative; }
.over .tagnum { position:absolute; right:-10px; bottom:-40px; font-family:var(--mono); font-weight:700;
                font-size:150px; letter-spacing:-.05em; color:var(--ink); background:var(--lime);
                padding:6px 26px; border-radius:24px; box-shadow:0 18px 40px rgba(20,22,26,.2); }
.foot { position:absolute; left:80px; right:80px; bottom:96px; display:flex; align-items:center; gap:22px; }
.logo { font-size:50px; font-weight:800; letter-spacing:-.02em; }
.logo em { font-style:normal; background:var(--lime); padding:0 12px; color:var(--ink); }
.tag { font-family:var(--mono); font-size:30px; color:var(--muted); }
.scene.dark .tag { color:#b9c0ad; }
`;

const PAGE = `
const D = __DATA__;
const foot = '<div class="foot in d3"><span class="logo">THE <em>OVERLAY</em></span><span class="tag">theoverlay.com.au</span></div>';
const pct = (v, lo, hi) => Math.max(6, Math.min(100, ((v - lo) / (hi - lo)) * 100));
/** The site itself, where we managed to shoot it; the drawn version otherwise. */
const has = (n) => D.shots.indexOf(n) >= 0;
const shot = (n, over) => '<div class="shot' + (over ? ' over' : '') + '"><img src="shot-' + n + '.png">' + (over || '') + '</div>';

const SCENES = {
  today: () =>
    '<div class="kicker in">Saturday racing</div>' +
    '<h1 class="in d1">Group One<br>at Caulfield.</h1>' +
    (has('board') ? shot('board') :
      '<div class="rows">' + D.features.map((m, i) =>
        '<div class="trk in d' + (i + 1) + '"><div><span class="name">' + m.track + '</span><span class="st">' + m.state + '</span></div>' +
        '<div class="gs">' + m.races.map((r) => '<span class="g g' + r.g + '">G' + r.g + ' R' + r.n + '</span>').join('') + '</div></div>').join('') +
      '</div>') + foot,

  pick: () =>
    '<div class="kicker in">Best of the day</div>' +
    '<h1 class="in d1">' + D.track + '<br>Race ' + D.raceNumber + '.</h1>' +
    '<div class="runner"><span class="cloth pop">' + D.tab + '</span><div class="in d2"><h2>' + D.horse + '</h2>' +
    '<div class="meta">' + D.distance + 'm ' + D.className + ' \\u00b7 ' + D.going + ' \\u00b7 ' + D.field + ' runners</div></div></div>' +
    (has('pick') ? shot('pick') : '') + foot,

  late: () =>
    '<div class="kicker in">Closing sectionals</div>' +
    '<h1 class="in d1">It closes<br>like nothing<br>else in it.</h1>' +
    (has('sectionals')
      ? shot('sectionals', '<span class="tagnum pop">+' + D.lateGap + '</span>')
      : '<div class="bar in d2"><div class="lbl">' + D.horse + '</div><div class="track"><div class="fill" style="width:' +
        pct(+D.late, +D.lateAvg - 14, +D.late + 3) + '%"></div></div><div class="num">' + D.late + '</div></div>' +
        '<div class="bar in d3"><div class="lbl">The field</div><div class="track"><div class="fill dim" style="width:' +
        pct(+D.lateAvg, +D.lateAvg - 14, +D.late + 3) + '%"></div></div><div class="num">' + D.lateAvg + '</div></div>' +
        '<div class="gap pop">+' + D.lateGap + '</div>') +
    '<div class="meta in d3" style="margin-top:66px">points clear of the field on its closing sectional</div>' + foot,

  weight: () =>
    '<div class="kicker in">The query</div>' +
    '<h1 class="in d1">' + D.weight + 'kg, and it<br>settles ' + D.map + '.</h1>' +
    (has('map') ? shot('map') : '<div class="big pop">' + D.weight + '<small>kg</small></div>') +
    '<div class="note in d3">It gets back, and it has to come hard to win.</div>' + foot,

  price: () =>
    '<div class="kicker in">The price</div><h1 class="in d1">That is an<br><span class="mark">overlay.</span></h1>' +
    (has('market') ? shot('market') :
      '<div class="prices"><div class="price pop"><div class="k">Our rated</div><div class="v">' + D.rated + '</div></div>' +
      '<div class="price live pop"><div class="k">Live</div><div class="v">' + D.market + '</div></div></div>') +
    '<div class="note in d3">Anything over ' + D.takeAbove + ' we take. Right now it is ' + D.market + '.</div>' + foot,

  last: () =>
    '<div class="kicker in">Last start</div><h1 class="in d1">Won it<br>from the<br>midfield.</h1>' +
    (has('runs') ? shot('runs')
      : D.last ? '<div class="meta in d2" style="font-size:42px;margin-top:48px">' + D.last.track + ' \\u00b7 ' + D.last.distance + 'm \\u00b7 ' + D.last.className +
        '<br>Settled ' + D.last.map + ' \\u00b7 won by ' + D.last.margin.toFixed(2) + 'L</div>' : '') + foot,

  class: () =>
    '<div class="kicker in">The field it meets</div><h1 class="in d1">Nothing<br>near it.</h1>' +
    (has('rankings') ? shot('rankings') :
      '<div class="barlist">' + D.bars.map((b) =>
        '<div class="row ' + (b.me ? 'me' : '') + '"><span class="who">' + b.tab + '. ' + b.horse + '</span>' +
        '<span class="t"><span style="width:' + pct(b.today, D.bars[D.bars.length - 1].today - 8, D.bars[0].today + 2) + '%"></span></span>' +
        '<span class="v">' + b.today.toFixed(1) + '</span></div>').join('') + '</div>') + foot,

  close: () =>
    '<div class="kicker in">' + D.track + ' R' + D.raceNumber + '</div>' +
    '<div class="runner" style="margin-top:22px"><span class="cloth pop">' + D.tab + '</span><div class="in d1"><h2>' + D.horse + '</h2></div></div>' +
    '<div class="prices"><div class="price pop"><div class="k">Our rated</div><div class="v">' + D.rated + '</div></div>' +
    '<div class="price live pop"><div class="k">Live</div><div class="v">' + D.market + '</div></div></div>' +
    '<div class="note in d3">Take anything over ' + D.takeAbove + '.</div>' +
    '<h1 class="in d3" style="font-size:92px">Every runner<br><span class="mark">rated, every day.</span></h1>' + foot,
};

const stage = document.getElementById("stage");
D.beats.forEach((b, i) => {
  const s = document.createElement("div");
  s.className = "scene" + (b.scene === "close" ? " dark" : "") + (i % 2 ? " out" : "");
  s.style.setProperty("--dur", (b.until - b.at) + "s");
  s.innerHTML = '<div class="zoom">' + SCENES[b.scene]() + '</div>';
  stage.appendChild(s);
});
const scenes = [...stage.children];
let current = -1;
const show = (i) => {
  if (i === current) return;
  current = i;
  scenes.forEach((s, n) => {
    s.classList.remove("on");
    if (n === i) { void s.offsetWidth; s.classList.add("on"); }
  });
};
show(0);
window.__at = (s) => { let i = 0; D.beats.forEach((b, n) => { if (s >= b.at) i = n; }); show(i); };
window.__run = (ms) => new Promise((done) => {
  const t0 = performance.now();
  const tick = () => {
    const s = (performance.now() - t0) / 1000;
    window.__at(s);
    if (s * 1000 < ms) requestAnimationFrame(tick); else done();
  };
  requestAnimationFrame(tick);
});
`;

const dir = `marketing/reels/${date}-${meeting.track.toLowerCase().replace(/\W+/g, "-")}-r${race.raceNumber}`;
mkdirSync(dir, { recursive: true });

/**
 * The site itself, shot at phone width so the reel shows the thing being
 * sold rather than a drawing of it. SITE= points it somewhere else; the
 * local server wants OVERLAY_OPEN=1 so the members' sections are open.
 */
const SITE = process.env.SITE ?? "http://localhost:3000";
const racePath = `/racing/${date}/${meeting.meetingId}/${encodeURIComponent(race.raceId)}`;
const shots = new Set<string>();
{
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  const hide = ".topbar, .site-head, .ntg, .launch-offer, nextjs-portal { display: none !important } html { scroll-behavior: auto }";
  const grab = async (name: string, what: () => Promise<{ x: number; y: number; width: number; height: number } | null>) => {
    try {
      const clip = await what();
      if (!clip || clip.width < 40 || clip.height < 40) return;
      await p.screenshot({ path: `${dir}/shot-${name}.png`, clip });
      shots.add(name);
    } catch {
      // a shot we cannot take is one the scene does without
    }
  };
  const box = async (sel: string) => {
    const el = p.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(250);
    return el.boundingBox();
  };
  /** From one element's top to another's bottom, so a shot can span headings. */
  const span = async (from: string, to: string) => {
    const a = await box(from);
    const c = await box(to);
    if (!a || !c) return null;
    const a2 = await box(from);
    if (!a2) return null;
    return { x: 8, y: a2.y - 10, width: 374, height: Math.min(1380, c.y + c.height - a2.y + 20) };
  };

  await p.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  await p.addStyleTag({ content: hide });
  await grab("board", async () => {
    const rows = p.locator(".matrix-table tbody tr");
    const first = await rows.nth(0).boundingBox();
    const second = await rows.nth(1).boundingBox();
    if (!first || !second) return null;
    return { x: 8, y: first.y - 6, width: 374, height: second.y + second.height - first.y + 12 };
  });

  await p.goto(`${SITE}${racePath}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2800);
  await p.addStyleTag({ content: hide });
  await grab("pick", async () => box(".pick-card"));
  await grab("map", async () => span('section.section:has(h2:text-is("Speed map")) .section-bar', ".rail"));
  await grab("rankings", async () => span('section.section:has(h2:text-is("Rankings")) .section-bar', ".bar-row:nth-of-type(4)"));
  await grab("market", async () => {
    const row = await box(`#runner-${data.tab}`);
    if (!row) return null;
    return { x: 8, y: row.y - 6, width: 374, height: row.height + 12 };
  });
  // The runner's own panel, for the sectionals and the last runs.
  await p.locator(`#runner-${data.tab}`).click();
  await p.waitForTimeout(900);
  await grab("sectionals", async () => span(".sec-bars", ".cond-tiles"));
  await grab("runs", async () => {
    const head = await box(".runner-detail-runs .detail-panel > summary");
    const rows = p.locator(".runs-table .runs-row");
    const third = await rows.nth(2).boundingBox();
    if (!head || !third) return null;
    const head2 = await box(".runner-detail-runs .detail-panel > summary");
    if (!head2) return null;
    return { x: 8, y: head2.y - 8, width: 374, height: third.y + third.height - head2.y + 30 };
  });
  await b.close();
}

data.shots = [...shots];

const html =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">' +
  `<style>${STYLE}</style></head><body><div class="stage" id="stage"></div>` +
  `<script>${PAGE.replace("__DATA__", JSON.stringify(data))}</script></body></html>`;

writeFileSync(`${dir}/reel.html`, html);
const file = `file://${process.cwd().replace(/\\/g, "/")}/${dir}/reel.html`;
const total = BEATS[BEATS.length - 1].until;

const browser = await chromium.launch({ channel: "chrome", headless: true });

// The video: one real-time pass through the beats.
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, recordVideo: { dir, size: { width: 1080, height: 1920 } } });
const page = await ctx.newPage();
await page.goto(file, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.evaluate((ms) => (window as unknown as { __run: (ms: number) => Promise<void> }).__run(ms), total * 1000);
await page.waitForTimeout(500);
await ctx.close();
for (const f of readdirSync(dir)) if (f.endsWith(".webm") && f !== "reel.webm") renameSync(`${dir}/${f}`, `${dir}/reel.webm`);

// A still per beat, taken once its motion has settled, for cutting by hand.
const shot = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await shot.goto(file, { waitUntil: "networkidle" });
await shot.waitForTimeout(900);
for (const b of BEATS) {
  await shot.evaluate((s) => (window as unknown as { __at: (s: number) => void }).__at(s), b.at + 0.05);
  await shot.waitForTimeout(1100);
  await shot.screenshot({ path: `${dir}/${b.id}.png` });
}
await browser.close();

const SHOT: Record<string, string> = {
  today: "Every Group race on the card, Caulfield first",
  pick: `Best of the day: ${data.track} R${data.raceNumber}, ${data.tab}. ${data.horse}`,
  late: `Closing sectionals ${data.late} against the field's ${data.lateAvg}, +${data.lateGap}`,
  weight: `${data.weight}kg, settles ${data.map}: it gets back and has to come hard`,
  price: `Rated ${data.rated}, live ${data.market}, take anything over ${data.takeAbove}`,
  last: data.last ? `Last start ${data.last.track} ${data.last.distance}m, won from ${data.last.map}` : "Last start",
  class: `${data.today} against a next best of ${data.nextBestToday}`,
  close: "Back to the price, then the brand card",
};
const mmss = (s: number) => `0:${String(s).padStart(2, "0")}`;
writeFileSync(
  `${dir}/shotlist.md`,
  `# ${meeting.track} R${race.raceNumber}, ${date}\n\n` +
    `**${data.tab}. ${data.horse}** — ${data.distance}m ${data.className}, ${data.going}, ${data.field} runners. ` +
    `Rated ${data.rated} against ${data.market}. Closes ${data.late} to a field average of ${data.lateAvg}, ${data.lateGap} clear. ` +
    `${data.weight}kg, settles ${data.map}.\n\n` +
    `| in | out | still | on screen |\n|---|---|---|---|\n` +
    BEATS.map((b) => `| ${mmss(b.at)} | ${mmss(b.until)} | \`${b.id}.png\` | ${SHOT[b.scene]} |`).join("\n") +
    `\n\n\`reel.webm\` runs the whole ${total} seconds at 1080x1920, each scene pushing in or pulling out. ` +
    `Lay the voiceover straight over it, or cut the stills to your own timing.\n`,
);
console.log(`\n${dir}/reel.webm  (${total}s, 1080x1920)`);
console.log(`${dir}/shotlist.md, reel.html and ${BEATS.length} stills`);
})();
