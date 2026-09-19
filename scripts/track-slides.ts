// A carousel for the day: a cover of the card in numbers, then one slide a
// track with its best bet and its best lay and why we make each of them.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/track-slides.ts 2026-09-19 [tracks]
// Writes marketing/slides/<date>/: 1080x1350 PNGs numbered for the carousel,
// slides.html to open and tweak, and caption.md.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { readRaceRuns, readStoredCard } from "../src/lib/model/store";
import { finishFit, observations, settles, tempoFit } from "../src/lib/model/narrative";
import { ratingRank } from "../src/lib/model/publish";
import { callEdge, callPrice, type PublishedRace, type PublishedRun, type PublishedRunner } from "../src/lib/model/types";

void (async () => {
  const [date, countArg] = process.argv.slice(2);
  if (!date) throw new Error("Give a date.");
  const limit = Number(countArg) || 7;

  const stored = await readStoredCard(date);
  if (!stored) throw new Error(`no card for ${date}`);
  const card = stored.card;

  const money = (n?: number) => (n ? `$${n.toFixed(2)}` : "\u2014");
  const pts = (n?: number) => (n === undefined ? "" : `${n >= 0 ? "+" : "\u2212"}${Math.abs(n * 100).toFixed(1)}%`);

  /**
   * Why this one, in its own words, and arguing its own side. The stored
   * `why` is the same shape for every runner, which across seven slides reads
   * as one sentence repeated; the observation engine behind What to expect
   * gives each runner its own facts, but it returns both sides, so a bet was
   * listing what is wrong with it and a lay what is right.
   *
   * A bet takes the facts in its favour. A lay takes the ones against it, and
   * where a horse has none worth saying, the honest reason is the one we
   * actually have: it rates below what the market is charging.
   */
  const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
  const lower = (t: string) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

  const reason = (x: PublishedRunner, race: PublishedRace, side: "bet" | "lay"): string => {
    const want = side === "bet" ? 1 : -1;
    const facts: string[] = [];
    const t = tempoFit(x, race);
    if (Math.sign(t.tone) === want) facts.push(t.text);
    const f = finishFit(x, race);
    if (Math.sign(f.tone) === want) facts.push(f.text);
    for (const o of observations(x, race)) {
      if (facts.length >= 3) break;
      if (Math.sign(o.tone) === want) facts.push(o.text);
    }
    // Nothing on its side of the ledger: say where it rates, which is the case.
    if (facts.length === 0) {
      const rank = ratingRank(race.runners, x);
      facts.push(
        side === "lay"
          ? `rates ${ord(rank)} of ${race.runners.filter((y) => !y.scratched).length} on our numbers`
          : `rates ${ord(rank)} in the field at ${x.ratings.today.toFixed(1)}`,
      );
    }
    const tail = facts.map(lower).join(", ");
    return `${settles(x)}. ${tail[0].toUpperCase()}${tail.slice(1)}.`;
  };

  /** The runs live outside the card now, so the races we quote get theirs back. */
  const withRuns = async (race: PublishedRace): Promise<PublishedRace> => {
    if (race.runners.some((x) => x.runs?.length)) return race;
    const runs = (await readRaceRuns(date, race.raceId).catch(() => ({}))) as Record<string, PublishedRun[]>;
    if (Object.keys(runs).length === 0) return race;
    return { ...race, runners: race.runners.map((x) => ({ ...x, runs: runs[String(x.tabNumber)] ?? x.runs })) };
  };

  const tracks = card.meetings
    .map((m) => {
      const all = m.races.flatMap((r) => r.runners.filter((x) => !x.scratched).map((x) => ({ x, r })));
      const bet = all.filter((v) => v.x.signal === "back").sort((a, b) => (b.x.edge ?? 0) - (a.x.edge ?? 0))[0];
      const lay = all.filter((v) => v.x.signal === "lay").sort((a, b) => (callEdge(a.x) ?? 0) - (callEdge(b.x) ?? 0))[0];
      return { meeting: m, bet, lay };
    })
    .filter((t) => t.bet || t.lay)
    .slice(0, limit);

  const races = card.meetings.flatMap((m) => m.races);
  const calls = races.flatMap((r) => r.runners.filter((x) => x.signal && !x.scratched));
  const cover = {
    meetings: card.meetings.length,
    races: races.length,
    runners: races.reduce((a, r) => a + r.runners.filter((x) => !x.scratched).length, 0),
    bets: calls.filter((x) => x.signal === "back").length,
    lays: calls.filter((x) => x.signal === "lay").length,
    primes: calls.filter((x) => x.prime).length,
  };

  const day = new Date(`${date}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Sydney" });

  const slides = await Promise.all(tracks.map(async (t) => {
    const betRace = t.bet ? await withRuns(t.bet.r) : undefined;
    const layRace = t.lay ? await withRuns(t.lay.r) : undefined;
    const betRunner = betRace?.runners.find((x) => x.tabNumber === t.bet!.x.tabNumber) ?? t.bet?.x;
    const layRunner = layRace?.runners.find((x) => x.tabNumber === t.lay!.x.tabNumber) ?? t.lay?.x;
    return ({
    track: t.meeting.track,
    state: t.meeting.state,
    going: t.meeting.trackCondition ?? "",
    races: t.meeting.races.length,
    bet: t.bet
      ? {
          race: t.bet.r.raceNumber,
          tab: t.bet.x.tabNumber,
          horse: t.bet.x.horseName,
          live: money(callPrice(t.bet.x)),
          rated: money(t.bet.x.ratedPrice),
          edge: pts(callEdge(t.bet.x)),
          prime: Boolean(t.bet.x.prime),
          why: reason(betRunner!, betRace!, "bet"),
        }
      : null,
    lay: t.lay
      ? {
          race: t.lay.r.raceNumber,
          tab: t.lay.x.tabNumber,
          horse: t.lay.x.horseName,
          live: money(callPrice(t.lay.x)),
          rated: money(t.lay.x.ratedPrice),
          edge: pts(callEdge(t.lay.x)),
          why: reason(layRunner!, layRace!, "lay"),
        }
      : null,
  });
  }));

  const data = { day, cover, slides };

  const STYLE = `
:root { --ink:#14161a; --panel:#fff; --soft:#f3f5ef; --line:#dfe3d8; --lime:#c4f000; --blue:#1668ff; --red:#e63023;
        --muted:#8a9080; --display:'Archivo',sans-serif; --mono:'IBM Plex Mono',monospace; }
* { box-sizing:border-box; margin:0; padding:0; }
body { background:#555; font-family:var(--display); color:var(--ink); }
.slide { position:relative; width:1080px; height:1350px; padding:84px 76px 170px; background:var(--soft);
         display:flex; flex-direction:column; justify-content:center; overflow:hidden; }
.slide.dark { background:var(--ink); color:#fff; }
.kicker { font-family:var(--mono); font-size:30px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--muted); }
.slide.dark .kicker { color:var(--lime); }
h1 { font-size:110px; font-weight:800; line-height:.96; letter-spacing:-.03em; margin-top:18px; }
h2 { font-size:76px; font-weight:800; line-height:1; letter-spacing:-.025em; }
.where { font-family:var(--mono); font-size:32px; color:var(--muted); margin-top:16px; }
.mark { background:var(--lime); padding:0 16px; color:var(--ink); }
.calls { margin-top:44px; display:flex; flex-direction:column; gap:26px; }
/* No coloured spine down the side: the pill says which it is, and the bar
   made every card look like it came out of a template. */
.call { border-radius:30px; padding:34px 36px; background:var(--panel); border:3px solid var(--line); }
.tagrow { display:flex; align-items:center; gap:16px; }
.tag { font-family:var(--mono); font-size:26px; font-weight:800; letter-spacing:.12em; text-transform:uppercase;
       padding:6px 16px; border-radius:999px; color:#fff; background:var(--blue); }
.tag.lay { background:var(--red); }
.tag.prime { background:var(--lime); color:var(--ink); }
.rno { font-family:var(--mono); font-size:28px; color:var(--muted); font-weight:700; }
.horse { font-size:54px; font-weight:800; letter-spacing:-.02em; margin-top:14px; line-height:1.05; }
.why { font-size:31px; line-height:1.4; color:var(--color-ink-secondary, #3d4147); margin-top:14px; }
.prices { display:flex; align-items:baseline; gap:26px; margin-top:20px; font-family:var(--mono); }
.prices b { font-size:44px; font-weight:700; }
.prices span { font-size:26px; color:var(--muted); font-weight:600; }
.prices .edge { font-weight:700; color:var(--blue); font-size:30px; }
.call.lay .prices .edge { color:var(--red); }
.grid { margin-top:56px; display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.tile { background:var(--panel); border:3px solid var(--line); border-radius:30px; padding:34px; text-align:center; }
.tile.blue { background:var(--blue); border-color:var(--blue); color:#fff; }
.tile.red { background:var(--red); border-color:var(--red); color:#fff; }
.tile.lime { background:var(--lime); border-color:var(--lime); }
/* A plain tile on the dark cover is a dark panel, not a white one the white numbers vanish into. */
.slide.dark .tile { background:#22252b; border-color:#3a3f48; color:#fff; }
.slide.dark .tile.blue { background:var(--blue); border-color:var(--blue); }
.slide.dark .tile.red { background:var(--red); border-color:var(--red); }
.tile .n { font-family:var(--mono); font-size:112px; font-weight:700; line-height:1; letter-spacing:-.04em; }
.tile .l { font-family:var(--mono); font-size:26px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; margin-top:10px; opacity:.75; }
.spacer { display:none; }
.foot { position:absolute; left:76px; right:76px; bottom:66px; display:flex; align-items:center; gap:20px; }
.logo { font-size:46px; font-weight:800; letter-spacing:-.02em; }
.logo em { font-style:normal; background:var(--lime); padding:0 12px; color:var(--ink); }
.tag2 { font-family:var(--mono); font-size:27px; color:var(--muted); }
.slide.dark .tag2 { color:#b9c0ad; }
.swipe { margin-left:auto; font-family:var(--mono); font-size:27px; font-weight:700; color:var(--muted); }
`;

  const PAGE = `
const D = __DATA__;
const foot = (swipe) => '<div class="foot"><span class="logo">THE <em>OVERLAY</em></span>' +
  '<span class="tag2">theoverlay.com.au</span>' + (swipe ? '<span class="swipe">swipe \\u2192</span>' : '') + '</div>';

const call = (c, kind) => !c ? '' :
  '<div class="call ' + kind + (c.prime ? ' prime' : '') + '">' +
    '<div class="tagrow"><span class="tag ' + (c.prime ? 'prime' : kind) + '">' + (c.prime ? 'Prime' : kind === 'bet' ? 'Bet' : 'Lay') + '</span>' +
      '<span class="rno">Race ' + c.race + '</span></div>' +
    '<div class="horse">' + c.tab + '. ' + c.horse + '</div>' +
    '<div class="why">' + c.why + '</div>' +
    '<div class="prices"><b>' + c.live + '</b><span>we rate it ' + c.rated + '</span><span class="edge">' + c.edge + '</span></div>' +
  '</div>';

const slides = [];
slides.push('<div class="slide dark"><div class="kicker">' + D.day + '</div>' +
  '<h1>The card<br><span class="mark">in numbers.</span></h1>' +
  '<div class="grid">' +
    '<div class="tile"><div class="n">' + D.cover.meetings + '</div><div class="l">meetings</div></div>' +
    '<div class="tile"><div class="n">' + D.cover.races + '</div><div class="l">races</div></div>' +
    '<div class="tile blue"><div class="n">' + D.cover.bets + '</div><div class="l">' + (D.cover.bets === 1 ? 'bet' : 'bets') + '</div></div>' +
    '<div class="tile red"><div class="n">' + D.cover.lays + '</div><div class="l">' + (D.cover.lays === 1 ? 'lay' : 'lays') + '</div></div>' +
  '</div>' +
  '<div class="where" style="margin-top:40px">' + D.cover.runners + ' runners rated, every one with a price.</div>' +
  '<div class="spacer"></div>' + foot(true) + '</div>');

D.slides.forEach((s, i) => {
  slides.push('<div class="slide"><div class="kicker">Today\\'s calls</div>' +
    '<h2>' + s.track + '</h2>' +
    '<div class="where">' + s.state + (s.going ? ' \\u00b7 ' + s.going : '') + ' \\u00b7 ' + s.races + ' races</div>' +
    '<div class="calls">' + call(s.bet, 'bet') + call(s.lay, 'lay') + '</div>' +
    '<div class="spacer"></div>' + foot(i < D.slides.length - 1) + '</div>');
});

slides.push('<div class="slide dark"><div class="kicker">Every race, every day</div>' +
  '<h1>Every runner<br><span class="mark">rated.</span></h1>' +
  '<div class="where" style="margin-top:34px;font-size:36px;line-height:1.5">A benchmark rating and a price for every horse.<br>' +
  'We call a bet only where the market is longer than our price, and a lay only where it is shorter.<br>One race free every day.</div>' +
  '<div class="spacer"></div>' +
  '<h2 style="font-size:58px">theoverlay.com.au</h2>' + foot(false) + '</div>');

document.body.innerHTML = slides.join('');
`;

  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">' +
    `<style>${STYLE}</style></head><body></body>` +
    `<script>${PAGE.replace("__DATA__", JSON.stringify(data))}</script></html>`;

  const dir = `marketing/slides/${date}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/slides.html`, html);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await page.goto(`file://${process.cwd().replace(/\\/g, "/")}/${dir}/slides.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const all = page.locator(".slide");
  const n = await all.count();
  for (let i = 0; i < n; i++) await all.nth(i).screenshot({ path: `${dir}/${String(i + 1).padStart(2, "0")}.png` });
  await browser.close();

  writeFileSync(
    `${dir}/caption.md`,
    `${day}. ${cover.races} races across ${cover.meetings} meetings, ${cover.runners} runners rated.\n\n` +
      `${cover.bets} ${cover.bets === 1 ? "bet" : "bets"} and ${cover.lays} ${cover.lays === 1 ? "lay" : "lays"}, one to a track in here. Swipe for the reason behind each one.\n\n` +
      tracks
        .map((t) => {
          const parts: string[] = [];
          if (t.bet) parts.push(`Bet R${t.bet.r.raceNumber} ${t.bet.x.tabNumber}. ${t.bet.x.horseName} ${money(callPrice(t.bet.x))}`);
          if (t.lay) parts.push(`Lay R${t.lay.r.raceNumber} ${t.lay.x.tabNumber}. ${t.lay.x.horseName} ${money(callPrice(t.lay.x))}`);
          return `${t.meeting.track}: ${parts.join(". ")}.`;
        })
        .join("\n") +
      `\n\nEvery runner rated, every race, every day. theoverlay.com.au\n\n18+. Gamble responsibly.\n`,
  );

  console.log(`\n${dir}/  ${n} slides at 1080x1350`);
  console.log(`${dir}/caption.md and slides.html`);
})();
