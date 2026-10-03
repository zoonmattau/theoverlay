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
// LAYS=1 takes each race's lay instead of its bet (2 Oct 2026, Moruya). PRE=1 is
// the reel before the races: nothing need be settled, and the close lists the
// calls with "Results tonight" in place of the units. BETS=1 takes each race's
// plain bet, pilled BET not PRIME, and closes on the whole day: the winners
// shown, then every settled bet's count and units and the lays' line, so a
// reel of winners never reads as the day's strike rate (3 Oct 2026).
import { chromium, type Page } from "playwright-core";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readStoredCard } from "../src/lib/model/store";
import { KNOWN_BOOKIES } from "../src/lib/bookies";
import { supabaseAdmin } from "../src/lib/billing/access";
import { PLANS, TRIAL_DAYS } from "../src/lib/billing/plans";

void (async () => {
  const [date, ...raceIds] = process.argv.slice(2);
  const LAYS = process.env.LAYS === "1";
  const PRE = process.env.PRE === "1";
  const BETS = process.env.BETS === "1";
  const SIDE = LAYS ? "lay" : "back";
  const PILL = LAYS ? "LAY" : BETS ? "BET" : "PRIME";
  if (!date || raceIds.length === 0) throw new Error("Give a date and one or more race ids.");
  const stored = await readStoredCard(date);
  if (!stored) throw new Error(`no card for ${date}`);

  const races = raceIds.map((id) => {
    const meeting = stored.card.meetings.find((m) => m.races.some((r) => r.raceId === id));
    const race = meeting?.races.find((r) => r.raceId === id);
    if (!meeting || !race) throw new Error(`no race ${id} on ${date}`);
    const call = LAYS ? race.runners.find((x) => x.signal === "lay" && !x.scratched) : BETS ? race.runners.find((x) => x.signal === "back" && !x.scratched) : (race.runners.find((x) => x.prime) ?? race.runners.find((x) => x.signal === "back"));
    const jump = race.jumpTime ? new Date(race.jumpTime).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" }).replace(" ", "") : "";
    // The prices the race screen shows, so the card and the screen agree.
    const money = (n?: number) => (n ? `$${n.toFixed(2)}` : "");
    return { id, meetingId: meeting.meetingId, track: meeting.track, number: race.raceNumber, horse: call?.horseName ?? "", tab: call?.tabNumber, won: call?.finishPosition === 1, jump, market: money(call?.marketPrice), rated: money(call?.ratedPrice), jockey: call?.jockey ?? "", barrier: call?.barrier, distance: race.distance };
  });

  // Everything claimed comes off the ledger, the same rows the Results page
  // reads: a winner's price is what it settled at (the best of the fixed odds
  // while it was a bet, the jump and the starting prices), and the close is
  // the units the calls settled for. Nothing unsettled is shown.
  const { data: ledger, error } = await supabaseAdmin().from("tips").select("race_id, tab_number, side, market_price, rated_price, finish_position, units, stake, settled_at").eq("date", date).eq("source", "model");
  if (error) throw new Error(`tips: ${error.message}`);
  const rowOf = (r: (typeof races)[number]) => (ledger ?? []).find((t) => t.race_id === r.id && t.tab_number === r.tab && t.side === SIDE);
  // BETS=1 shows the call as it was made and paid: the rated price when it
  // went out and the price it settled at, not the card's latest.
  if (BETS)
    races.forEach((r) => {
      const row = rowOf(r);
      if (row?.market_price) r.market = `$${Number(row.market_price).toFixed(2)}`;
      if (row?.rated_price) r.rated = `$${Number(row.rated_price).toFixed(2)}`;
    });
  const proofs = (process.env.PROOF?.split(",") ?? []).filter(Boolean).map((id) => {
    const r = races.find((x) => x.id === id);
    const row = r && rowOf(r);
    if (!r?.won || !row?.settled_at || row.finish_position !== 1) throw new Error(`PROOF ${id}: not a settled win for our call, on the card and in the ledger`);
    return { ...r, price: `$${Number(row.market_price).toFixed(2)}` };
  });
  const rows = races.map(rowOf);
  const unsettled = races.filter((_, i) => !rows[i]?.settled_at);
  if (unsettled.length && !PRE) throw new Error(`not settled yet: ${unsettled.map((r) => r.id).join(", ")}`);
  const missing = races.filter((_, i) => !rows[i]);
  if (missing.length) throw new Error(`no ${SIDE} on the ledger for: ${missing.map((r) => r.id).join(", ")}`);
  const units = PRE ? 0 : rows.reduce((a, t) => a + Number(t!.units), 0);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}u`;
  // A call landed: a bet that won, a lay whose horse did not.
  const landed = (t: { finish_position: number | null } | undefined) => (LAYS ? t?.finish_position !== 1 : t?.finish_position === 1);
  const lines = races.map((r, i) =>
    PRE
      ? { horse: r.horse, price: r.market, won: true, units: `rated ${r.rated}` }
      : { horse: r.horse, price: `$${Number(rows[i]!.market_price).toFixed(2)}`, won: landed(rows[i]!), units: signed(Number(rows[i]!.units)) },
  );
  const unitsText = PRE ? "before the races" : signed(units);
  const wins = PRE ? 0 : rows.filter((t) => landed(t!)).length;
  // The whole day off the ledger for BETS=1, settled calls only.
  const day = (side: string) => {
    const xs = (ledger ?? []).filter((t) => t.side === side && t.settled_at && t.finish_position !== null);
    return { n: xs.length, won: xs.filter((t) => (side === "lay" ? t.finish_position !== 1 : t.finish_position === 1)).length, units: xs.reduce((a, t) => a + Number(t.units ?? 0), 0), open: (ledger ?? []).filter((t) => t.side === side && !t.settled_at).length };
  };
  const dayBets = day("back");
  const dayLays = day("lay");
  const dayUnits = dayBets.units + dayLays.units;
  // The record since launch for BETS=1's close: every settled call that ran,
  // summed by day, the same rows the Results page reads.
  const running: { date: string; total: number }[] = [];
  if (BETS) {
    const all: { date: string; units: number }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin().from("tips").select("date, units").eq("source", "model").not("settled_at", "is", null).not("finish_position", "is", null).order("id").range(from, from + 999);
      if (error) throw new Error(`tips: ${error.message}`);
      all.push(...((data ?? []) as typeof all));
      if (!data || data.length < 1000) break;
    }
    const byDay = new Map<string, number>();
    for (const t of all) if (t.date <= date) byDay.set(t.date, (byDay.get(t.date) ?? 0) + Number(t.units));
    let sum = 0;
    for (const [d, u] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) running.push({ date: d, total: (sum += u) });
  }
  if (BETS && dayBets.open + dayLays.open) console.log(`  ! ${dayBets.open} bets and ${dayLays.open} lays still open, the close counts the settled ones`);

  const NUMBERS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  const title = process.env.TITLE ?? (LAYS ? `${NUMBERS[races.length] ?? races.length} we are laying today` : BETS ? `${signed(dayUnits).replace("u", "")} units today` : `${NUMBERS[races.length] ?? races.length} Prime bets today`);
  const slams = process.env.SLAMS === "1";
  const words = process.env.WORDS?.split(",") ?? races.map(() => (LAYS ? "LAY" : BETS ? "BET" : "BACK"));

  const dir = `marketing/reels/${date}-${LAYS ? "lays" : BETS ? "winners" : "slams"}${PRE ? "-pre" : ""}`;
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
    await page.goto(`${SITE}/racing/${date}/${encodeURIComponent(r.meetingId)}/${encodeURIComponent(r.id)}`, { waitUntil: "networkidle", timeout: 180_000 });
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
    if (proof) {
      // BETS=1: the sticker carries the price the call settled at, the best on
      // offer, so the page's own win box (often the lower dividend) comes out.
      if (BETS) await page.addStyleTag({ content: ".result-row.place-1 > .shrink-0 { display:none !important }" });
      await page.screenshot({ path: `${dir}/proof-${r.id}.png` });
    }
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
  // BETS=1 opens on the day's numbers instead of the pile of calls.
  const TITLE_END = BETS ? 3.0 : BANG_AT + races.length * BANG + 1.4;
  // BETS=1 gives each winner its race frame first, a band left for the replay.
  const REPLAY = 3.0;
  const SLAM = 1.3;
  const PROOF = 2.0;
  const STICK = 0.55;
  // The bets tick in, the total counts up, then the address.
  // The address waits for the rows and the total, so a long list still reads.
  const rowsN = BETS ? 2 : races.length;
  const SEE = BETS ? 4.0 : Math.max(2.9, 0.35 + races.length * 0.35 + 1.3);
  const CLOSE = SEE + 2.1;
  // Track and race number, so two winners at one meeting keep a frame each.
  const slug = (r: (typeof races)[number]) => `${r.track.toLowerCase().replace(/\W+/g, "-")}-r${r.number}`;
  const beats: { id: string; at: number; until: number; say: string }[] = [{ id: "0-title", at: 0, until: TITLE_END, say: `${title}: ${races.map((r) => `${r.horse} ${r.market} (rated ${r.rated})`).join(", ")}` }];
  const next = () => beats[beats.length - 1].until;
  if (slams) races.forEach((r, i) => beats.push({ id: `${beats.length}-${slug(r)}`, at: next(), until: next() + SLAM + (i === races.length - 1 ? 0.8 : 0), say: `${words[i]}: ${r.track} R${r.number}, ${r.tab}. ${r.horse}` }));
  const frameStart: number[] = [];
  const proofStart = proofs.map((r) => {
    if (BETS) {
      frameStart.push(next());
      beats.push({ id: `${beats.length}-frame-${slug(r)}`, at: next(), until: next() + REPLAY, say: `FRAME: ${r.track} R${r.number}, ${r.horse}, the race replay goes in the band (stretch to the replay's length)` });
    }
    const at = next();
    beats.push({ id: `${beats.length}-won-${slug(r)}`, at, until: at + PROOF, say: `WON${BETS ? ` ${r.price}` : ""}: ${r.track} R${r.number}, ${r.horse}, the site's result screen with its WIN price` });
    return at;
  });
  const closeAt = next();
  beats.push({ id: `${beats.length}-close`, at: closeAt, until: closeAt + CLOSE, say: PRE ? `the ${races.length} with price and rated price, results tonight, see all plays at theoverlay.com.au` : BETS ? `bets ${dayBets.won} from ${dayBets.n} ${signed(dayBets.units)}, lays ${dayLays.won} of ${dayLays.n} held ${signed(dayLays.units)}, profit today ${signed(dayUnits)}, see all plays at theoverlay.com.au` : `${unitsText} on the ${races.length} (${wins} ${LAYS ? "held" : "won"}), see all plays at theoverlay.com.au` });
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
.bang.compact { padding:20px 32px 22px; border-radius:28px; display:grid; grid-template-columns:1fr auto; column-gap:24px; align-items:center; }
.bang.compact .top { gap:16px; }
.bang.compact .pill { font-size:24px; padding:8px 18px; }
.bang.compact .where { font-size:26px; }
.bang.compact .horse { font-size:52px; margin-top:6px; grid-column:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bang.compact .prices { grid-column:2; grid-row:1 / span 2; margin-top:0; gap:12px; }
.bang.compact .price { padding:6px 18px 10px; border-radius:18px; }
.bang.compact .price i { font-size:20px; }
.bang.compact .price b { font-size:46px; }
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
.sticker b small.odds { font-size:.62em; margin-top:4px; }
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
.close .laymark { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:24px; letter-spacing:.06em; color:var(--ink); }
.close .px + .u { font-size:34px; color:#b9c0ad; }
.close .rg { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:28px; color:#b9c0ad; margin-top:22px; opacity:0; }
.close .tonight { font-weight:800; font-size:150px; line-height:1; letter-spacing:-.05em; color:var(--lime); }
.close .see { font-weight:800; font-size:64px; letter-spacing:-.03em; color:#fff; margin-top:84px; opacity:0; }
.close .site { font-weight:800; font-size:92px; letter-spacing:-.04em; color:var(--ink); background:var(--lime); padding:4px 26px 12px; width:fit-content; margin-top:12px; opacity:0; }
/* Six or more rows go compact so the header, the total and the address all fit. */
.close.many .rows { gap:12px; margin-top:24px; }
.close.many .row { padding:12px 24px; grid-template-columns:64px 1fr auto auto; }
.close.many .mark { width:64px; height:64px; }
.close.many .mark svg { width:40px; height:40px; }
.close.many .horse { font-size:40px; }
.close.many .px { font-size:30px; }
.close.many .u { font-size:40px; }
.close.many .total { margin-top:36px; padding-top:24px; flex-direction:column; align-items:flex-start; gap:6px; }
.close.many .total i { white-space:nowrap; }
.close.many .count { font-size:190px; }
@keyframes rowin { 0% { opacity:0; transform:translateX(-120px); } 70% { opacity:1; transform:translateX(10px); } 100% { opacity:1; transform:none; } }
.flash { position:absolute; inset:0; background:#fff; opacity:0; pointer-events:none; }
@keyframes show { from { opacity:1; } to { opacity:1; } }
@keyframes pop { 0% { opacity:0; transform:scale(.6); } 70% { opacity:1; transform:scale(1.06); } 100% { opacity:1; transform:scale(1); } }
@keyframes slam { 0% { opacity:1; transform:scale(1.45) rotate(-2deg); } 55% { transform:scale(.98) rotate(.4deg); } 70% { transform:translate(-14px,8px) scale(1.01); } 85% { transform:translate(10px,-6px); } 100% { opacity:1; transform:none; } }
@keyframes stamp { 0% { opacity:0; transform:scale(2.4) rotate(-6deg); } 60% { opacity:1; transform:scale(.94) rotate(-3deg); } 100% { opacity:1; transform:rotate(-3deg); } }
@keyframes flash { 0% { opacity:.85; } 100% { opacity:0; } }
`;
  // The race frame: the call above, a band 1080x608 left clear where CapCut
  // puts a 16:9 clip at fit on a 9:16 canvas, who to watch below.
  // BETS=1 sits lower: Instagram's top bar covers the first ~200px.
  const BAND_TOP = BETS ? 560 : 656;
  const BAND_H = 608;
  const FRAME_CSS = `
.panel { position:absolute; left:0; right:0; background:var(--ink); }
.panel.top { top:0; height:${BAND_TOP}px; padding:150px 70px 0; }
.panel.bottom { top:${BAND_TOP + BAND_H}px; bottom:0; padding:36px 70px 0; }
.edge { position:absolute; left:0; right:0; height:8px; background:var(--lime); z-index:2; }
/* BETS=1 heads each frame with the date and the day's profit. */
.panel.top.day { padding-top:220px; }
.panel.top.day .bang { padding:24px 36px 28px; }
.panel.top.day .horse { font-size:62px; margin-top:8px; }
/* BETS=1's bottom: our price against the market's, the reason it was a bet. */
.odds { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.odds div { border-radius:24px; padding:14px 0 18px; text-align:center; background:#1f2228; border:4px solid #33383f; }
.odds div.mkt { background:var(--lime); border-color:var(--lime); }
.odds i { display:block; font-style:normal; font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:28px; letter-spacing:.14em; color:#b9c0ad; }
.odds .mkt i { color:var(--ink); }
.odds b { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:76px; letter-spacing:-.03em; color:#fff; }
.odds .mkt b { color:var(--ink); }
.dayline { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:34px; letter-spacing:.1em; text-transform:uppercase; color:#b9c0ad; margin-bottom:26px; display:flex; justify-content:space-between; align-items:baseline; }
.dayline b { font-family:'Archivo',sans-serif; font-weight:800; font-size:52px; letter-spacing:-.03em; text-transform:none; color:var(--ink); background:var(--lime); padding:0 16px 4px; border-radius:10px; }
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
/* In the reel the band shows where the replay goes. */
.band { position:absolute; left:0; right:0; top:${BAND_TOP}px; height:${BAND_H}px; background:#2a2e35; display:flex; align-items:center; justify-content:center;
  font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:40px; letter-spacing:.2em; color:#6b7280; }
`;
  const frameHtml = (r: (typeof races)[number]) =>
    `<div class="panel top${BETS ? " day" : ""}">` +
    (BETS ? `<div class="dayline">${dayName} <b>${signed(dayUnits)} today</b></div>` : "") +
    `<div class="bang"><div class="top"><span class="pill">${PILL}</span><span class="where">${r.jump} · ${r.track} R${r.number}</span></div>` +
    `<div class="horse">${r.tab}. ${r.horse}</div>` +
    (BETS ? "" : `<div class="prices"><div class="price ours"><i>PRICE</i><b>${r.market}</b></div><div class="price"><i>RATED</i><b>${r.rated}</b></div></div>`) +
    `</div></div>` +
    `<div class="edge" style="top:${BAND_TOP - 8}px"></div><div class="edge" style="top:${BAND_TOP + BAND_H}px"></div>` +
    (BETS
      ? `<div class="panel bottom"><div class="odds"><div><i>WE RATED IT</i><b>${r.rated}</b></div><div class="mkt"><i>MARKET</i><b>${r.market}</b></div></div>`
      : // The card above names the horse; down here is only how to spot it: the saddlecloth and who is riding.
        `<div class="panel bottom"><div class="watch"><div class="cloth">${r.tab}</div><div><i>WATCH THE ${r.tab}</i><b>${r.jockey}</b>` +
        `<span>${[r.barrier ? `barrier ${r.barrier}` : "", r.distance ? `${r.distance}m` : ""].filter(Boolean).join(" · ")}</span></div></div>`) +
    `<div class="trial"><b>${LAYS || BETS ? "Every call" : "Every Prime bet"}, ${TRIAL_DAYS} days free</b><span>then from $${Math.min(...PLANS.map((p) => p.price))} a month <em>theoverlay.com.au</em></span></div></div>`;
  // The opening for BETS=1 goes over the presenter's own footage: the date and
  // the day's profit counting up across the top third, a fade behind them so
  // they read over any shot, and the rest left clear for the face.
  const INTRO_CSS = `
.intro { background:transparent; }
.intro .fade { position:absolute; left:0; right:0; top:0; height:820px; background:linear-gradient(180deg, rgba(20,22,26,.88) 0%, rgba(20,22,26,.7) 55%, rgba(20,22,26,0) 100%); }
.intro .head { position:absolute; left:80px; right:80px; top:230px; }
.intro .kick { display:flex; justify-content:space-between; font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:36px; letter-spacing:.16em; text-transform:uppercase; color:#e3e7dc; opacity:0; text-shadow:0 2px 12px rgba(0,0,0,.6); }
.intro .num { display:block; font-weight:800; font-size:270px; line-height:1; letter-spacing:-.06em; color:var(--lime); margin-top:6px; text-shadow:0 10px 50px rgba(0,0,0,.55);
  counter-reset:w calc((var(--n) - 5) / 10) t mod(var(--n), 10); }
.intro .num::after { content:var(--sign) counter(w) "." counter(t) "u"; }
.intro .face { position:absolute; left:0; right:0; top:820px; bottom:0; display:flex; align-items:center; justify-content:center;
  font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:40px; letter-spacing:.2em; color:#6b7280; }
`;
  const dayName = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  // placeholder: true in the reel, where a grey stand-in marks the face; false for the transparent overlay.
  const introHtml = (placeholder: boolean) =>
    `<div class="layer intro" style="${anim("show", 0, TITLE_END)}${placeholder ? "background:#2a2e35;" : ""}">` +
    (placeholder ? `<div class="face">YOUR FACE</div>` : "") +
    `<div class="fade"></div><div class="head">` +
    `<div class="kick" style="${anim("pop", 0.1, 0.35)}"><span>${dayName}</span><span>Profit today</span></div>` +
    `<span class="num" style="--sign:'${dayUnits >= 0 ? "+" : "−"}';--to:${Math.round(Math.abs(dayUnits) * 10)};animation:count 1.5s cubic-bezier(.2,.75,.25,1) 0.3s forwards;"></span>` +
    `</div></div>`;
  // The running total since launch as a line that draws itself in.
  const GRAPH_CSS = `
.graph { margin-top:40px; opacity:0; }
.graph .gh { display:flex; justify-content:space-between; align-items:baseline; font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:30px; letter-spacing:.14em; text-transform:uppercase; color:#b9c0ad; }
.graph .gh b { font-family:'Archivo',sans-serif; font-weight:800; font-size:56px; letter-spacing:-.03em; text-transform:none; color:var(--lime); }
.graph svg { display:block; margin-top:14px; }
.graph .line { stroke-dasharray:1; stroke-dashoffset:1; }
@keyframes draw { from { stroke-dashoffset:1; } to { stroke-dashoffset:0; } }
`;
  const graphHtml = (at: number) => {
    if (running.length < 2) return "";
    const W = 920, H = 340, pad = 14;
    const lo = Math.min(0, ...running.map((p) => p.total)), hi = Math.max(0, ...running.map((p) => p.total));
    const x = (i: number) => pad + (i * (W - 2 * pad)) / (running.length - 1);
    const y = (v: number) => pad + ((hi - v) * (H - 2 * pad)) / (hi - lo || 1);
    const pts = running.map((p, i) => `${x(i).toFixed(1)},${y(p.total).toFixed(1)}`);
    const last = running[running.length - 1];
    const since = new Date(`${running[0].date}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
    return (
      `<div class="graph" style="${anim("pop", at, 0.3)}"><div class="gh"><span>Since ${since}</span><b>${signed(last.total)}</b></div>` +
      `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      `<line x1="${pad}" x2="${W - pad}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="#4a5058" stroke-width="3" stroke-dasharray="10 10"/>` +
      `<polygon points="${x(0).toFixed(1)},${y(0).toFixed(1)} ${pts.join(" ")} ${x(running.length - 1).toFixed(1)},${y(0).toFixed(1)}" fill="rgba(196,240,0,.12)"/>` +
      `<polyline class="line" pathLength="1" points="${pts.join(" ")}" fill="none" stroke="#c4f000" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" style="animation:draw 1.1s cubic-bezier(.3,.7,.3,1) ${(at + 0.15).toFixed(2)}s forwards;"/>` +
      `<circle cx="${x(running.length - 1).toFixed(1)}" cy="${y(last.total).toFixed(1)}" r="16" fill="#c4f000" style="opacity:0;${anim("pop", at + 1.2, 0.3)}"/>` +
      `</svg></div>`
    );
  };
  const statsHtml = () =>
    `<div class="layer stats" style="${anim("show", 0, TITLE_END)}">` +
    `<div class="kick" style="${anim("pop", 0.1, 0.35)}">${dayName}</div>` +
    `<div class="big" style="${anim("bang", 0.35, 0.4)}">${signed(dayUnits)}</div>` +
    `<div class="flash" style="${anim("flash", 0.47, 0.18)}"></div>` +
    `<div class="sub" style="${anim("pop", 0.75, 0.35)}">profit today</div>` +
    `<div class="lbl" style="${anim("pop", 1.2, 0.3)}">Bet winners at</div>` +
    `<div class="chips">${odds.map((r, i) => `<span class="chip" style="${anim("pop", 1.35 + i * 0.16, 0.3)}">${r.price}</span>`).join("")}</div>` +
    `<div class="split" style="${anim("pop", 1.5 + odds.length * 0.16 + 0.2, 0.35)}"><b>Bets</b> ${dayBets.won} from ${dayBets.n} · ${signed(dayBets.units)}<br><b>Lays</b> ${dayLays.won} of ${dayLays.n} held · ${signed(dayLays.units)}</div>` +
    `</div>`;
  // Every animation is written with its delay and fills forwards only, so the
  // whole reel is one timeline that can be paused at any second for a still,
  // and nothing shows before its moment.
  const anim = (name: string, at: number, dur: number) => `animation:${name} ${dur}s cubic-bezier(.2,.9,.25,1) ${at}s forwards;`;
  const tick = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#14161a"/><path d="M6.5 12.5l3.6 3.6 7.4-8" fill="none" stroke="#c4f000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const tickMark = '<svg viewBox="0 0 24 24"><path d="M5.5 12.5l4.2 4.2 8.8-9.4" fill="none" stroke="#14161a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const cross = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="#8a9080" stroke-width="3.2" stroke-linecap="round"/></svg>';
  let z = 2;
  const compact = races.length > 4;
  const body =
    (BETS ? introHtml(true) : `<div class="layer title" style="${anim("show", 0, TITLE_END)}">` +
    title.split(" ").map((w, i) => `<span class="${/prime|lay|^[+−]\d/i.test(w) ? "hit" : ""}" style="${anim("pop", 0.1 + i * 0.18, 0.4)}">${w}</span>`).join("") +
    races
      .map((r, i) => {
        const at = BANG_AT + i * BANG;
        const tilt = ["-3deg", "2.5deg", "-1.5deg", "3deg"][i % 4];
        // Five or more go in compact, one line of prices each, so the pile fits under a long title.
        const top = compact ? 660 + i * Math.min(210, Math.floor(1060 / (races.length - 1))) : 540 + i * 385;
        return (
          `<div class="bang${compact ? " compact" : ""}" style="top:${top}px;z-index:${i + 1};--r0:${i % 2 ? "14deg" : "-14deg"};--r:${tilt};${anim("bang", at, 0.36)}">` +
          `<div class="top"><span class="pill">${PILL}</span><span class="where">${r.jump} · ${r.track} R${r.number}</span></div>` +
          `<div class="horse">${r.tab}. ${r.horse}</div>` +
          `<div class="prices"><div class="price ours"><i>PRICE</i><b>${r.market}</b></div><div class="price"><i>RATED</i><b>${r.rated}</b></div></div></div>` +
          `<div class="flash" style="${anim("flash", at + 0.12, 0.16)}"></div>`
        );
      })
      .join("") +
    `</div>`) +
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
          (BETS ? `<div class="layer frame" style="z-index:${z++};${anim("show", frameStart[i], REPLAY)}"><div class="band">RACE REPLAY</div>${frameHtml(r)}<div class="flash" style="${anim("flash", frameStart[i], 0.22)}"></div></div>` : "") +
          `<div class="layer screen" style="z-index:${z++};${anim("slam", at, 0.42)}"><img src="proof-${r.id}.png">` +
          `<div class="sticker" style="${anim("stick", at + STICK, 0.4)}"><b><span class="won">${tick}WON</span>${BETS ? `<small class="odds">${r.price}</small>` : ""}</b></div>` +
          `<div class="flash" style="${anim("flash", at, 0.22)}"></div><div class="flash" style="${anim("flash", at + STICK + 0.12, 0.18)}"></div></div>`
        );
      })
      .join("") +
    `<div class="layer close${races.length > 5 && !BETS ? " many" : ""}" style="z-index:${z++};${anim("show", closeAt, CLOSE)}">` +
    `<div class="what" style="${anim("pop", closeAt + 0.1, 0.35)}">${BETS ? "Today's calls" : `Today's ${NUMBERS[races.length]?.toLowerCase() ?? races.length} ${LAYS ? "lays" : "Prime bets"}`}</div>` +
    `<div class="rows">` +
    (BETS
      ? [
          { mark: "BET", what: "Bets", px: `${dayBets.won} from ${dayBets.n}`, u: signed(dayBets.units) },
          { mark: "LAY", what: "Lays", px: `${dayLays.won} of ${dayLays.n} held`, u: signed(dayLays.units) },
        ]
          .map((l, i) => `<div class="row won" style="${anim("rowin", closeAt + 0.35 + i * 0.35, 0.35)}"><span class="mark"><b class="laymark">${l.mark}</b></span><span class="horse">${l.what}</span><span class="px">${l.px}</span><span class="u">${l.u}</span></div>`)
          .join("")
      : lines
      .map((l, i) =>
        `<div class="row${l.won ? " won" : ""}" style="${anim("rowin", closeAt + 0.35 + i * 0.35, 0.35)}">` +
        `<span class="mark">${PRE ? `<b class="laymark">${PILL}</b>` : l.won ? tickMark : cross}</span><span class="horse">${l.horse}</span><span class="px">${l.price}</span><span class="u">${l.units}</span></div>`,
      )
      .join("")) +
    `</div>` +
    // The total counts up in tenths: --n runs 0 to the units times ten.
    (PRE
      ? `<div class="total" style="${anim("pop", closeAt + 0.35 + rowsN * 0.35 + 0.1, 0.3)}"><i>Results</i><span class="tonight">tonight</span></div>`
      : `<div class="total" style="${anim("pop", closeAt + 0.35 + rowsN * 0.35 + 0.1, 0.3)}"><i>${BETS ? "Profit today" : `${wins} from ${races.length}`}</i>` +
    `<span class="count" style="--sign:'${(BETS ? dayUnits : units) >= 0 ? "+" : "−"}';--to:${Math.round(Math.abs(BETS ? dayUnits : units) * 10)};animation:count 1s cubic-bezier(.15,.8,.3,1) ${(closeAt + 0.35 + rowsN * 0.35 + 0.2).toFixed(2)}s forwards;"></span></div>`) +
    (BETS ? graphHtml(closeAt + 0.35 + rowsN * 0.35 + 1.3) : "") +
    `<div class="see" style="${BETS ? "margin-top:48px;" : ""}${anim("pop", closeAt + SEE, 0.4)}">See all plays at</div>` +
    `<div class="site" style="${anim("bang", closeAt + SEE + 0.25, 0.4)}">theoverlay.com.au</div>` +
    `<div class="rg" style="${anim("pop", closeAt + SEE + 0.5, 0.3)}">18+ · Gamble responsibly · 1800 858 858</div>` +
    `<div class="flash" style="${anim("flash", closeAt + SEE + 0.4, 0.18)}"></div></div>`;
  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Mono:wght@600;700&display=swap" rel="stylesheet">' +
    `<style>${STYLE}${BETS ? FRAME_CSS + INTRO_CSS + GRAPH_CSS : ""}</style></head><body>${body}` +
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
  // BETS=1: the intro and each winner's WON sticker as transparent clips, to
  // lay over the presenter's footage, a result screen or the replay's finish.
  // Frame by frame off their own timeline, then ProRes 4444 with its alpha when
  // FFMPEG= points at an ffmpeg (there is none on this machine by default). The
  // last frame is kept as a PNG too, to hold for as long as the edit needs.
  if (BETS) {
    const FPS = 30;
    const clip = async (name: string, css: string, html: string, seconds: number) => {
      const frames = `${dir}/${name}-frames`;
      mkdirSync(frames, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      await page.setContent(
        '<!doctype html><html><head><meta charset="utf-8">' +
          '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Mono:wght@600;700&display=swap" rel="stylesheet">' +
          `<style>${STYLE}${css} html, body { background:transparent !important; }</style></head><body>${html}` +
          `<script>window.__at = (s) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = s * 1000; }); window.__at(0);</script></body></html>`,
        { waitUntil: "networkidle" },
      );
      await page.waitForTimeout(600);
      const n = Math.round(seconds * FPS);
      for (let f = 0; f < n; f++) {
        await page.evaluate((t) => (window as unknown as { __at: (s: number) => void }).__at(t), f / FPS);
        await page.screenshot({ path: `${frames}/${String(f).padStart(4, "0")}.png`, omitBackground: true });
      }
      await page.close();
      // The last frame stays as a still; the clip still ends on it.
      const last = `${frames}/${String(n - 1).padStart(4, "0")}.png`;
      writeFileSync(`${dir}/${name}.png`, readFileSync(last));
      if (process.env.FFMPEG) {
        execFileSync(process.env.FFMPEG, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${frames}/%04d.png`, "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", `${dir}/${name}.mov`]);
        rmSync(frames, { recursive: true, force: true });
        console.log(`  + ${name}.mov (${seconds}s, transparent) and ${name}.png`);
      } else console.log(`  + ${frames}/ (PNG frames; set FFMPEG= for a .mov)`);
    };
    await clip("intro-overlay", INTRO_CSS, introHtml(false), TITLE_END);
    // The sticker lands a tenth in and holds a second after, so a cut can come anywhere in the hold.
    for (const r of proofs) {
      await clip(
        `won-sticker-${slug(r)}`,
        "",
        `<div class="layer" style="opacity:1"><div class="sticker" style="${anim("stick", 0.1, 0.4)}"><b><span class="won">${tick}WON</span><small class="odds">${r.price}</small></b></div></div>`,
        1.5,
      );
      // The result screen as the site shows it, under the sticker, with no sticker on it.
      writeFileSync(`${dir}/won-screen-${slug(r)}.png`, readFileSync(`${dir}/proof-${r.id}.png`));
    }
  }
  // An overlay per race for its footage, which is landscape in a portrait
  // reel: the frame with the band left transparent.
  const overlay = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const r of races) {
    const html =
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Mono:wght@600;700&display=swap" rel="stylesheet">' +
      `<style>${STYLE}${FRAME_CSS}
html, body { background:transparent; }
</style></head><body>${frameHtml(r)}</body></html>`;
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
