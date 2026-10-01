// A short 9:16 reel: the day's calls slammed in on top of each other under a
// title, each with its price and rated price; then each winner's result
// screen with a WON sticker slammed across it at its settled price; then a
// close with the units the calls made and where to see the rest. No reasons
// on screen; race footage gets cut in by hand.
//   OVERLAY_OPEN=1 OVERLAY_READONLY=1 npx next dev
//   PROOF=KALG_011026_1,WNBL_011026_5 npx tsx --conditions=react-server --env-file=.env.local scripts/reel-slams.ts 2026-10-01 KALG_011026_1 WNBL_011026_5 ILGR_011026_5
// PROOF= names the winners to show; each is refused unless the stored card
// and the ledger both have our call there first. TITLE= changes the title
// ("Three Prime bets today"). SLAMS=1 adds each race screen stamped BACK
// between the title and the winners, and WORDS= (comma separated) its words.
// Writes marketing/reels/<date>-slams/: reel.webm (1080x1920), a still per
// beat, the raw screens, reel.html, shotlist.md, and overlay-<track>.png for
// each race: a frame to lay over its race footage, clear through the middle.
import { chromium, type Page } from "playwright-core";
import { mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { readStoredCard } from "../src/lib/model/store";
import { KNOWN_BOOKIES } from "../src/lib/bookies";
import { supabaseAdmin } from "../src/lib/billing/access";
import { PLANS, TRIAL_DAYS } from "../src/lib/billing/plans";

void (async () => {
  const [date, ...raceIds] = process.argv.slice(2);
  if (!date || raceIds.length === 0) throw new Error("Give a date and one or more race ids.");
  const stored = await readStoredCard(date);
  if (!stored) throw new Error(`no card for ${date}`);

  const races = raceIds.map((id) => {
    const meeting = stored.card.meetings.find((m) => m.races.some((r) => r.raceId === id));
    const race = meeting?.races.find((r) => r.raceId === id);
    if (!meeting || !race) throw new Error(`no race ${id} on ${date}`);
    const call = race.runners.find((x) => x.prime) ?? race.runners.find((x) => x.signal === "back");
    const jump = race.jumpTime ? new Date(race.jumpTime).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" }).replace(" ", "") : "";
    // The prices the race screen shows, so the card and the screen agree.
    const money = (n?: number) => (n ? `$${n.toFixed(2)}` : "");
    return { id, meetingId: meeting.meetingId, track: meeting.track, number: race.raceNumber, horse: call?.horseName ?? "", tab: call?.tabNumber, won: call?.finishPosition === 1, jump, market: money(call?.marketPrice), rated: money(call?.ratedPrice), jockey: call?.jockey ?? "", barrier: call?.barrier, distance: race.distance };
  });

  // Everything claimed comes off the ledger, the same rows the Results page
  // reads: a winner's price is what it settled at (the best of the fixed odds
  // while it was a bet, the jump and the starting prices), and the close is
  // the units the calls settled for. Nothing unsettled is shown.
  const { data: ledger, error } = await supabaseAdmin().from("tips").select("race_id, tab_number, side, market_price, finish_position, units, settled_at").eq("date", date).eq("source", "model");
  if (error) throw new Error(`tips: ${error.message}`);
  const rowOf = (r: (typeof races)[number]) => (ledger ?? []).find((t) => t.race_id === r.id && t.tab_number === r.tab && t.side === "back");
  const proofs = (process.env.PROOF?.split(",") ?? []).filter(Boolean).map((id) => {
    const r = races.find((x) => x.id === id);
    const row = r && rowOf(r);
    if (!r?.won || !row?.settled_at || row.finish_position !== 1) throw new Error(`PROOF ${id}: not a settled win for our call, on the card and in the ledger`);
    return { ...r, price: `$${Number(row.market_price).toFixed(2)}` };
  });
  const rows = races.map(rowOf);
  const unsettled = races.filter((_, i) => !rows[i]?.settled_at);
  if (unsettled.length) throw new Error(`not settled yet: ${unsettled.map((r) => r.id).join(", ")}`);
  const units = rows.reduce((a, t) => a + Number(t!.units), 0);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}u`;
  const lines = races.map((r, i) => ({ horse: r.horse, price: `$${Number(rows[i]!.market_price).toFixed(2)}`, won: rows[i]!.finish_position === 1, units: signed(Number(rows[i]!.units)) }));
  const unitsText = signed(units);
  const wins = rows.filter((t) => t!.finish_position === 1).length;

  const NUMBERS = ["", "One", "Two", "Three", "Four", "Five", "Six"];
  const title = process.env.TITLE ?? `${NUMBERS[races.length] ?? races.length} Prime bets today`;
  const slams = process.env.SLAMS === "1";
  const words = process.env.WORDS?.split(",") ?? races.map(() => "BACK");

  const dir = `marketing/reels/${date}-slams`;
  mkdirSync(dir, { recursive: true });
  const SITE = process.env.SITE ?? "http://localhost:3000";
  // Race screens from a run with SLAMS=1 are dropped when this one has none.
  if (!slams) for (const f of readdirSync(dir)) if (f.startsWith("screen-")) unlinkSync(`${dir}/${f}`);
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  // The race screen as a phone shows it, top of the page. No bookie is named
  // on screen, same as the ads.
  const slamAt = new Map<string, number>();
  const bookie = new RegExp(`^(${KNOWN_BOOKIES.join("|")})$`, "i").source;
  const open = async (r: (typeof races)[number]): Promise<Page> => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    await page.goto(`${SITE}/racing/${date}/${r.meetingId}/${r.id}`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.addStyleTag({ content: "nextjs-portal, .ntg, .bookie-link { display:none !important }" });
    await page.evaluate((source) => {
      const re = new RegExp(source, "i");
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (re.test(n.textContent?.trim() ?? "")) n.textContent = "Live";
    }, bookie);
    await page.waitForTimeout(800);
    return page;
  };
  for (const r of races) {
    const proof = proofs.some((p) => p.id === r.id);
    if (!proof && !slams) continue;
    let page = await open(r);
    if (proof) await page.screenshot({ path: `${dir}/proof-${r.id}.png` });
    if (slams) {
      // The slam is the call before the jump. A race already run puts its
      // result above the call, so the result and the result strip come out and
      // the page reads as it did before the jump.
      if (proof) {
        await page.close();
        page = await open(r);
      }
      await page.evaluate(() => {
        for (const s of document.querySelectorAll<HTMLElement>("section.section")) if (/^results/i.test(s.querySelector("h2")?.textContent?.trim() ?? "")) s.style.display = "none";
        document.querySelector<HTMLElement>(".race-clock")?.style.setProperty("display", "none");
        window.scrollTo(0, 0);
      });
      // The word lands just under the Prime card, so the race and the call stay in sight.
      const card = await page.evaluate(() => document.querySelector(".pick-card")?.getBoundingClientRect().bottom);
      slamAt.set(r.id, Math.min(card ? Math.round(card * 3 * (1080 / 1170)) + 24 : 1150, 1600));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/screen-${r.id}.png` });
    }
    await page.close();
    console.log(`  + ${[proof && "proof", slams && "screen"].filter(Boolean).join(" and ")}  ${r.track} R${r.number}, ${r.horse}${r.won ? ", won" : ""}`);
  }

  // Timeline in seconds. The title, then the calls bang in on top of each
  // other, then a hold to read them; each winner's screen lands clean and holds
  // before its sticker; the close holds long enough to read the address.
  const BANG = 0.45;
  const BANG_AT = 1.0;
  const TITLE_END = BANG_AT + races.length * BANG + 1.4;
  const SLAM = 1.3;
  const PROOF = 2.0;
  const STICK = 0.55;
  // The bets tick in, the total counts up, then the address.
  const CLOSE = 5.0;
  const slug = (r: (typeof races)[number]) => r.track.toLowerCase().replace(/\W+/g, "-");
  const beats: { id: string; at: number; until: number; say: string }[] = [{ id: "0-title", at: 0, until: TITLE_END, say: `${title}: ${races.map((r) => `${r.horse} ${r.market} (rated ${r.rated})`).join(", ")}` }];
  const next = () => beats[beats.length - 1].until;
  if (slams) races.forEach((r, i) => beats.push({ id: `${beats.length}-${slug(r)}`, at: next(), until: next() + SLAM + (i === races.length - 1 ? 0.8 : 0), say: `${words[i]}: ${r.track} R${r.number}, ${r.tab}. ${r.horse}` }));
  const proofStart = proofs.map((r) => {
    const at = next();
    beats.push({ id: `${beats.length}-won-${slug(r)}`, at, until: at + PROOF, say: `WON: ${r.track} R${r.number}, ${r.horse}, the site's result screen with its WIN price` });
    return at;
  });
  const closeAt = next();
  beats.push({ id: `${beats.length}-close`, at: closeAt, until: closeAt + CLOSE, say: `${unitsText} on the ${races.length} (${wins} won), see all plays at theoverlay.com.au` });
  const total = next();

  const STYLE = `
:root { --ink:#14161a; --lime:#c4f000; }
* { box-sizing:border-box; margin:0; padding:0; }
body { width:1080px; height:1920px; overflow:hidden; background:var(--ink); font-family:'Archivo',sans-serif; }
.layer { position:absolute; inset:0; overflow:hidden; opacity:0; }
.title { padding:250px 90px 0; background:var(--ink); }
.title > span { display:inline-block; margin-right:28px; font-weight:800; color:#fff; font-size:118px; line-height:1.02; letter-spacing:-.04em; opacity:0; }
.title > span.hit { color:var(--ink); background:var(--lime); padding:0 22px; width:fit-content; }
/* Each call is a card that slams down over the last, a little lower and tilted,
   so all of them end up in a pile you can still read. */
.bang { position:absolute; left:70px; right:70px; padding:30px 40px 34px; border-radius:34px; background:#fff; color:var(--ink);
  border:6px solid var(--ink); box-shadow:0 34px 90px rgba(0,0,0,.6); opacity:0; }
.bang .top { display:flex; align-items:center; gap:24px; }
.bang .pill { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:30px; letter-spacing:.12em; background:var(--lime); border-radius:999px; padding:12px 24px; }
.bang .where { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:32px; color:#5d6357; }
.bang .horse { font-weight:800; font-size:68px; letter-spacing:-.03em; line-height:1.05; margin-top:12px; }
.bang .prices { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px; }
.bang .price { border-radius:22px; padding:10px 0 14px; text-align:center; border:4px solid #dfe3d8; background:#f3f5ef; }
.bang .price.ours { background:var(--lime); border-color:var(--lime); }
.bang .price i { display:block; font-style:normal; font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:26px; letter-spacing:.14em; color:#5d6357; }
.bang .price.ours i { color:var(--ink); }
.bang .price b { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:66px; letter-spacing:-.03em; }
@keyframes bang { 0% { opacity:0; transform:scale(1.9) rotate(var(--r0)); } 55% { opacity:1; transform:scale(.95) rotate(var(--r)); } 75% { transform:scale(1.03) rotate(var(--r)); } 100% { opacity:1; transform:rotate(var(--r)); } }
.screen img { width:1080px; display:block; }
.word { position:absolute; left:0; right:0; top:1150px; display:flex; justify-content:center; opacity:0; }
.word b { font-weight:800; font-size:230px; line-height:1; letter-spacing:-.05em; color:var(--ink); background:var(--lime); padding:14px 44px 22px; box-shadow:0 30px 80px rgba(0,0,0,.45); }
/* WON goes on like a SOLD sticker: across the middle, tilted, a thick ink edge. */
.sticker { position:absolute; left:0; right:0; top:760px; display:flex; justify-content:center; opacity:0; }
.sticker b { display:flex; flex-direction:column; align-items:center; font-weight:800; font-size:250px; line-height:.95; letter-spacing:-.05em; color:var(--ink); background:var(--lime);
  border:14px solid var(--ink); border-radius:34px; padding:26px 70px 34px; box-shadow:0 40px 120px rgba(0,0,0,.55); }
.sticker b .won { display:flex; align-items:center; }
.sticker b svg { width:.78em; height:.78em; margin-right:.14em; }
.sticker b small { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:.4em; letter-spacing:-.02em; margin-top:10px; }
@keyframes stick { 0% { opacity:0; transform:scale(3) rotate(-24deg); } 55% { opacity:1; transform:scale(.92) rotate(-11deg); } 75% { transform:scale(1.04) rotate(-13deg); } 100% { opacity:1; transform:rotate(-12deg); } }
/* The close is a scoreboard: each bet ticks in with its settled price and
   units, the total counts up from nothing, then the address slams on. */
@property --n { syntax:'<integer>'; inherits:false; initial-value:0; }
.close { display:flex; flex-direction:column; justify-content:center; padding:0 80px 140px; background:radial-gradient(1200px 900px at 50% 38%, #23290f 0%, var(--ink) 62%); }
.close .what { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:36px; letter-spacing:.16em; text-transform:uppercase; color:#b9c0ad; opacity:0; }
.close .rows { margin-top:34px; display:flex; flex-direction:column; gap:18px; }
.close .row { display:grid; grid-template-columns:84px 1fr auto auto; align-items:center; column-gap:20px; padding:22px 28px; border-radius:26px; background:#1f2228; border:3px solid #33383f; opacity:0; }
.close .row.won { border-color:var(--lime); }
.close .mark { width:84px; height:84px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:#33383f; }
.close .row.won .mark { background:var(--lime); }
.close .mark svg { width:52px; height:52px; }
.close .horse { font-weight:800; font-size:44px; letter-spacing:-.02em; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.close .row:not(.won) .horse { color:#8a9080; }
.close .px { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:34px; color:#b9c0ad; }
.close .u { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:46px; color:var(--lime); min-width:160px; text-align:right; }
.close .row:not(.won) .u { color:#8a9080; }
.close .total { margin-top:56px; display:flex; align-items:baseline; justify-content:space-between; border-top:4px solid #33383f; padding-top:34px; opacity:0; }
.close .total i { font-style:normal; font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:38px; letter-spacing:.14em; color:#b9c0ad; text-transform:uppercase; }
.close .count { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:220px; line-height:1; letter-spacing:-.06em; color:var(--lime);
  counter-reset:w calc((var(--n) - 5) / 10) t mod(var(--n), 10); }
.close .count::after { content:var(--sign) counter(w) "." counter(t) "u"; }
@keyframes count { from { --n:0; } to { --n:var(--to); } }
.close .see { font-weight:800; font-size:64px; letter-spacing:-.03em; color:#fff; margin-top:84px; opacity:0; }
.close .site { font-weight:800; font-size:92px; letter-spacing:-.04em; color:var(--ink); background:var(--lime); padding:4px 26px 12px; width:fit-content; margin-top:12px; opacity:0; }
@keyframes rowin { 0% { opacity:0; transform:translateX(-120px); } 70% { opacity:1; transform:translateX(10px); } 100% { opacity:1; transform:none; } }
.flash { position:absolute; inset:0; background:#fff; opacity:0; pointer-events:none; }
@keyframes show { from { opacity:1; } to { opacity:1; } }
@keyframes pop { 0% { opacity:0; transform:scale(.6); } 70% { opacity:1; transform:scale(1.06); } 100% { opacity:1; transform:scale(1); } }
@keyframes slam { 0% { opacity:1; transform:scale(1.45) rotate(-2deg); } 55% { transform:scale(.98) rotate(.4deg); } 70% { transform:translate(-14px,8px) scale(1.01); } 85% { transform:translate(10px,-6px); } 100% { opacity:1; transform:none; } }
@keyframes stamp { 0% { opacity:0; transform:scale(2.4) rotate(-6deg); } 60% { opacity:1; transform:scale(.94) rotate(-3deg); } 100% { opacity:1; transform:rotate(-3deg); } }
@keyframes flash { 0% { opacity:.85; } 100% { opacity:0; } }
`;
  // Every animation is written with its delay and fills forwards only, so the
  // whole reel is one timeline that can be paused at any second for a still,
  // and nothing shows before its moment.
  const anim = (name: string, at: number, dur: number) => `animation:${name} ${dur}s cubic-bezier(.2,.9,.25,1) ${at}s forwards;`;
  const tick = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#14161a"/><path d="M6.5 12.5l3.6 3.6 7.4-8" fill="none" stroke="#c4f000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const tickMark = '<svg viewBox="0 0 24 24"><path d="M5.5 12.5l4.2 4.2 8.8-9.4" fill="none" stroke="#14161a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const cross = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="#8a9080" stroke-width="3.2" stroke-linecap="round"/></svg>';
  let z = 2;
  const body =
    `<div class="layer title" style="${anim("show", 0, TITLE_END)}">` +
    title.split(" ").map((w, i) => `<span class="${/prime/i.test(w) ? "hit" : ""}" style="${anim("pop", 0.1 + i * 0.18, 0.4)}">${w}</span>`).join("") +
    races
      .map((r, i) => {
        const at = BANG_AT + i * BANG;
        const tilt = ["-3deg", "2.5deg", "-1.5deg", "3deg"][i % 4];
        return (
          `<div class="bang" style="top:${540 + i * 385}px;z-index:${i + 1};--r0:${i % 2 ? "14deg" : "-14deg"};--r:${tilt};${anim("bang", at, 0.36)}">` +
          `<div class="top"><span class="pill">PRIME</span><span class="where">${r.jump} · ${r.track} R${r.number}</span></div>` +
          `<div class="horse">${r.tab}. ${r.horse}</div>` +
          `<div class="prices"><div class="price ours"><i>PRICE</i><b>${r.market}</b></div><div class="price"><i>RATED</i><b>${r.rated}</b></div></div></div>` +
          `<div class="flash" style="${anim("flash", at + 0.12, 0.16)}"></div>`
        );
      })
      .join("") +
    `</div>` +
    (slams
      ? races
          .map((r, i) => {
            const at = beats[i + 1].at;
            const top = slamAt.get(r.id);
            return (
              `<div class="layer screen" style="z-index:${z++};${anim("slam", at, 0.42)}"><img src="screen-${r.id}.png">` +
              `<div class="word" style="${top ? `top:${top}px;` : ""}${anim("stamp", at + 0.18, 0.32)}"><b>${words[i] ?? ""}</b></div>` +
              `<div class="flash" style="${anim("flash", at, 0.22)}"></div></div>`
            );
          })
          .join("")
      : "") +
    proofs
      .map((r, i) => {
        const at = proofStart[i];
        return (
          `<div class="layer screen" style="z-index:${z++};${anim("slam", at, 0.42)}"><img src="proof-${r.id}.png">` +
          `<div class="sticker" style="${anim("stick", at + STICK, 0.4)}"><b><span class="won">${tick}WON</span></b></div>` +
          `<div class="flash" style="${anim("flash", at, 0.22)}"></div><div class="flash" style="${anim("flash", at + STICK + 0.12, 0.18)}"></div></div>`
        );
      })
      .join("") +
    `<div class="layer close" style="z-index:${z++};${anim("show", closeAt, CLOSE)}">` +
    `<div class="what" style="${anim("pop", closeAt + 0.1, 0.35)}">Today's ${NUMBERS[races.length]?.toLowerCase() ?? races.length} Prime bets</div>` +
    `<div class="rows">` +
    lines
      .map((l, i) =>
        `<div class="row${l.won ? " won" : ""}" style="${anim("rowin", closeAt + 0.35 + i * 0.35, 0.35)}">` +
        `<span class="mark">${l.won ? tickMark : cross}</span><span class="horse">${l.horse}</span><span class="px">${l.price}</span><span class="u">${l.units}</span></div>`,
      )
      .join("") +
    `</div>` +
    // The total counts up in tenths: --n runs 0 to the units times ten.
    `<div class="total" style="${anim("pop", closeAt + 0.35 + races.length * 0.35 + 0.1, 0.3)}"><i>${wins} from ${races.length}</i>` +
    `<span class="count" style="--sign:'${units >= 0 ? "+" : "−"}';--to:${Math.round(Math.abs(units) * 10)};animation:count 1s cubic-bezier(.15,.8,.3,1) ${(closeAt + 0.35 + races.length * 0.35 + 0.2).toFixed(2)}s forwards;"></span></div>` +
    `<div class="see" style="${anim("pop", closeAt + 2.9, 0.4)}">See all plays at</div>` +
    `<div class="site" style="${anim("bang", closeAt + 3.15, 0.4)}">theoverlay.com.au</div>` +
    `<div class="flash" style="${anim("flash", closeAt + 3.3, 0.18)}"></div></div>`;
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

  // A still per beat, from the end of it, for cutting by hand. Old stills go
  // first so a beat that no longer exists does not linger in the folder.
  for (const f of readdirSync(dir)) if (/^\d+-.*\.png$/.test(f)) unlinkSync(`${dir}/${f}`);
  const still = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await still.goto(file, { waitUntil: "networkidle" });
  await still.waitForTimeout(900);
  for (const b of beats) {
    await still.evaluate((s) => (window as unknown as { __at: (s: number) => void }).__at(s), b.until - 0.1);
    await still.waitForTimeout(300);
    await still.screenshot({ path: `${dir}/${b.id}.png` });
  }
  // An overlay per race for its footage, which is landscape in a portrait
  // reel. The middle band is left clear at 1080x608, where CapCut puts a
  // 16:9 clip at fit on a 9:16 canvas: the call above, who to watch below.
  const BAND_TOP = 656;
  const BAND_H = 608;
  const overlay = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const r of races) {
    const html =
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Mono:wght@600;700&display=swap" rel="stylesheet">' +
      `<style>${STYLE}
html, body { background:transparent; }
.panel { position:absolute; left:0; right:0; background:var(--ink); }
.panel.top { top:0; height:${BAND_TOP}px; padding:150px 70px 0; }
.panel.bottom { top:${BAND_TOP + BAND_H}px; bottom:0; padding:36px 70px 0; }
.edge { position:absolute; left:0; right:0; height:8px; background:var(--lime); z-index:2; }
.panel .bang { position:relative; left:0; right:0; opacity:1; transform:rotate(-1.2deg); }
.watch { display:flex; align-items:center; gap:30px; }
.watch .cloth { width:128px; height:128px; border-radius:26px; background:var(--lime); color:var(--ink); display:flex; align-items:center; justify-content:center;
  font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:84px; letter-spacing:-.04em; flex:none; }
.watch i { display:block; font-style:normal; font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:30px; letter-spacing:.16em; color:var(--lime); }
.watch b { display:block; font-weight:800; font-size:62px; letter-spacing:-.03em; color:#fff; line-height:1.05; margin-top:4px; }
.watch span { display:block; font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:30px; color:#b9c0ad; margin-top:8px; }
/* The trial, kept above the bottom ~350px a reel's caption and buttons cover. */
.trial { margin-top:28px; padding:20px 28px 22px; border:4px solid var(--lime); border-radius:26px; }
.trial b { display:block; font-weight:800; font-size:48px; letter-spacing:-.02em; color:#fff; line-height:1.1; white-space:nowrap; }
.trial span { display:flex; align-items:center; gap:16px; font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:28px; color:#b9c0ad; margin-top:10px; }
.trial em { font-style:normal; font-family:'Archivo',sans-serif; font-weight:800; font-size:34px; letter-spacing:-.02em; color:var(--ink); background:var(--lime); padding:2px 14px 6px; border-radius:10px; }
</style></head><body>` +
      `<div class="panel top"><div class="bang"><div class="top"><span class="pill">PRIME</span><span class="where">${r.jump} · ${r.track} R${r.number}</span></div>` +
      `<div class="horse">${r.tab}. ${r.horse}</div>` +
      `<div class="prices"><div class="price ours"><i>PRICE</i><b>${r.market}</b></div><div class="price"><i>RATED</i><b>${r.rated}</b></div></div></div></div>` +
      `<div class="edge" style="top:${BAND_TOP - 8}px"></div><div class="edge" style="top:${BAND_TOP + BAND_H}px"></div>` +
      `<div class="panel bottom"><div class="watch"><div class="cloth">${r.tab}</div><div><i>WATCH</i><b>${r.horse}</b>` +
      `<span>${[r.jockey, r.barrier ? `barrier ${r.barrier}` : "", r.distance ? `${r.distance}m` : ""].filter(Boolean).join(" · ")}</span></div></div>` +
      `<div class="trial"><b>Every Prime bet, ${TRIAL_DAYS} days free</b><span>then from $${Math.min(...PLANS.map((p) => p.price))} a month <em>theoverlay.com.au</em></span></div></div>` +
      `</body></html>`;
    await overlay.setContent(html, { waitUntil: "networkidle" });
    await overlay.waitForTimeout(400);
    await overlay.screenshot({ path: `${dir}/overlay-${slug(r)}.png`, omitBackground: true });
    console.log(`  + overlay-${slug(r)}.png`);
  }
  await browser.close();

  const mmss = (s: number) => `0:${s.toFixed(1).padStart(4, "0")}`;
  writeFileSync(
    `${dir}/shotlist.md`,
    `# ${title}, ${date}\n\n` +
      `| in | out | still | on screen |\n|---|---|---|---|\n` +
      beats.map((b) => `| ${mmss(b.at)} | ${mmss(b.until)} | \`${b.id}.png\` | ${b.say} |`).join("\n") +
      `\n\n\`reel.webm\` is the whole ${total.toFixed(1)} seconds at 1080x1920. Cut the race footage in before each WON, ` +
      `at its in point.\n`,
  );
  console.log(`\n${dir}/reel.webm  (${total.toFixed(1)}s, 1080x1920)  ${unitsText}, ${wins} of ${races.length} won`);
})();
