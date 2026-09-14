// Builds marketing/season-brief.html, the shareable page holding the Claude
// Design prompt and the season record, from backdate.json and the prompt file.
// node scripts/backdate-page.mjs
import { readFileSync, writeFileSync } from "node:fs";

const { races, calls } = JSON.parse(readFileSync("scripts/out/backdate.json", "utf8"));
const prompt = readFileSync("marketing/instagram-design-prompt.md", "utf8").split("\n---\n")[1].trim();
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fin = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n ? `${n}th` : "unpl");
const day = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
const gradeRank = { "Group 1": 0, "Group 2": 1, "Group 3": 2, Listed: 3 };
const SPONSORS = /^(HKJC World Pool|Asahi Super Dry|Kia Ora Stud|Stow Storage|Crown|Charter Keck Cramer|Catanach's Jewellers|Catanach’s Jewellers|myPlates|Yulong|Toyota Forklifts|Irresistible Pools|Schweppes|Lexus|De Bortoli|Hyland Race Colours|Gold Coast Turf Club|Paramount Liquor|Tobin Brothers|Quayclean|The Quayclean|Evergreen Turf|TAB|Chandon|Canterbury-Hurlstone Park RSL|Smithfield RSL|MSC Signs|McMahon's Dairy|Ive > )\s*/i;
const shortName = (n) => n.replace(SPONSORS, "").trim();

const bets = calls.filter((c) => c.signal === "back"), lays = calls.filter((c) => c.signal === "lay");
const sum = (xs) => xs.reduce((a, c) => a + c.units, 0);
const units = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}u`;
const g1 = races.filter((r) => r.grade === "Group 1");
const inTop = (r, n) => { const t = new Set(r.top4.map((x) => x.tab)); return r.result.slice(0, n).every((p) => t.has(p.tab)); };
const top4Wins = races.filter((r) => r.winnerRank).length;

const byDate = new Map();
for (const r of races) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)).push(r);

const chip = (signal, edge) => signal === "back" ? (edge >= 0.05 ? `<span class="chip prime">Prime</span>` : `<span class="chip bet">Bet</span>`) : signal === "lay" ? `<span class="chip lay">Lay</span>` : "";
const row = (x, cls, rank) => `<tr class="${cls}"><td class="rk">${rank}</td><td class="no"><span class="cloth">${x.tab}</span></td><td class="horse"><span class="name">${esc(x.horse)}</span>${x.jockey ? `<span class="jockey">${esc(x.jockey)}</span>` : ""}</td><td class="num">$${x.rated}</td><td class="num">$${x.market ?? "–"}</td><td class="call">${chip(x.signal, x.edge ?? 0)}</td><td class="num">${fin(x.finish)}</td></tr>`;

let weeks = "";
for (const [date, rs] of byDate) {
  rs.sort((a, b) => gradeRank[a.grade] - gradeRank[b.grade] || a.track.localeCompare(b.track) || a.raceNumber - b.raceNumber);
  const dayCalls = calls.filter((c) => c.date === date);
  const dayBets = dayCalls.filter((c) => c.signal === "back"), dayLays = dayCalls.filter((c) => c.signal === "lay");
  const firsts = rs.filter((r) => r.winnerRank === 1).length;
  weeks += `<section class="week" id="w${date}">
  <header class="week-head">
    <h2>${day(date)}</h2>
    <p class="week-line"><strong>${rs.filter((r) => r.winnerRank).length} of ${rs.length}</strong> winners in our top four${firsts ? `, <strong>${firsts}</strong> rated #1 won` : ""}.${dayBets.length ? ` Bets ${dayBets.filter((c) => c.won).length} of ${dayBets.length}, ${units(sum(dayBets))}.` : ""}${dayLays.length ? ` Lays ${dayLays.filter((c) => !c.won).length} of ${dayLays.length} held, ${units(sum(dayLays))}.` : ""}</p>
  </header>
  <div class="races">`;
  for (const r of rs) {
    const rc = calls.filter((c) => c.date === r.date && c.track === r.track && c.raceNumber === r.raceNumber);
    const winnerTab = r.result[0]?.tab;
    const wonCls = (tab, rank) => (tab === winnerTab ? (rank === 1 ? "won-top" : "won") : "");
    weeks += `<article class="race ${r.grade === "Group 1" ? "g1" : ""}">
      <div class="race-head">
        <span class="grade">${esc(r.grade)}</span>
        <h3>${esc(shortName(r.raceName))}</h3>
        <span class="meta">${esc(r.track)} R${r.raceNumber} · ${r.distance}m · ${esc(r.going)} · $${Math.round((r.prize ?? 0) / 1000)}k</span>
      </div>
      <div class="board-wrap"><table class="board">
        <thead><tr><th class="rk">#</th><th class="no"></th><th class="horse">Runner</th><th class="num">Rated</th><th class="num">Market</th><th class="call"></th><th class="num">Ran</th></tr></thead>
        <tbody>
        ${r.top4.map((t) => row(t, wonCls(t.tab, t.rank), t.rank)).join("\n        ")}
        ${rc.filter((c) => !c.rank).map((c) => row(c, `also ${wonCls(c.tab, 0)}`, "–")).join("\n        ")}
        </tbody>
      </table></div>
      <p class="verdict">${esc(r.verdict)}</p>
      <div class="result">
        <span class="result-label">Result</span>
        ${r.result.map((p) => `<span class="placing"><b>${p.pos}</b> ${esc(p.horse)}${p.sp ? ` <i>$${p.sp}</i>` : ""}</span>`).join("")}
        <span class="ours ${r.winnerRank ? (r.winnerRank === 1 ? "hit-top" : "hit") : "miss"}">${r.winnerRank ? `Our #${r.winnerRank}, rated $${r.winnerRated}` : `Not in our four, rated $${r.winnerRated}`}</span>
      </div>
      ${rc.length ? `<p class="settle">${rc.map((c) => `<span class="${c.units > 0 ? "up" : "down"}">${c.signal === "back" ? "Bet" : "Lay"} ${esc(c.horse)} $${c.market}: ${c.signal === "back" ? (c.won ? `won, +${(c.market - 1).toFixed(2)}u` : `${fin(c.finish)}, −1u`) : c.won ? `it won, −${(c.market - 1).toFixed(2)}u` : `held, +1u`}</span>`).join("")}</p>` : ""}
    </article>`;
  }
  weeks += `</div></section>`;
}

const html = `<title>Overlay Season Record</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..800&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --bg:#f3f4f0;--panel:#ffffff;--panel-alt:#f7f8f5;--surface:#eef0ea;
  --ink:#14161a;--ink-2:#454a44;--ink-3:#6b716a;--muted:#8b918a;
  --line:#dfe3db;--line-strong:#c9cec4;
  --lime:#c6f24e;--lime-soft:#edf9c8;--accent:#6f9a12;
  --blue:#1f6fd6;--blue-soft:#dcebff;--red:#d93636;--red-soft:#ffe1e1;
  --bar:#14161a;--bar-ink:#f5f7f2;--bar-soft:#a9aea4;
  --shadow:0 1px 2px rgba(20,22,26,.06),0 6px 20px -12px rgba(20,22,26,.18);
  --sans:"Archivo",ui-sans-serif,system-ui,sans-serif;--mono:"IBM Plex Mono","SF Mono",Consolas,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#111316;--panel:#1b1e23;--panel-alt:#1f2328;--surface:#23272d;
  --ink:#f5f7f2;--ink-2:#c9cec4;--ink-3:#a9aea4;--muted:#7d837c;
  --line:#2c3138;--line-strong:#3a4048;
  --lime-soft:#2a3a12;--accent:#c6f24e;--blue:#6ea8ff;--blue-soft:#1c2e4a;--red:#ff7a7a;--red-soft:#4a1c1c;
  --bar:#0b0c0e;--shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px -12px rgba(0,0,0,.6);
}}
:root[data-theme="dark"]{
  --bg:#111316;--panel:#1b1e23;--panel-alt:#1f2328;--surface:#23272d;
  --ink:#f5f7f2;--ink-2:#c9cec4;--ink-3:#a9aea4;--muted:#7d837c;
  --line:#2c3138;--line-strong:#3a4048;
  --lime-soft:#2a3a12;--accent:#c6f24e;--blue:#6ea8ff;--blue-soft:#1c2e4a;--red:#ff7a7a;--red-soft:#4a1c1c;
  --bar:#0b0c0e;--shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px -12px rgba(0,0,0,.6);
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.45;margin:0}
.bar{background:var(--bar);color:var(--bar-ink);padding:14px 24px;display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}
.wordmark{font-weight:800;font-size:18px;letter-spacing:-.01em;color:var(--lime)}
.bar span{color:var(--bar-soft);font-size:13px}
.wrap{max-width:1040px;margin:0 auto;padding-block:28px 64px;padding-inline:20px;display:flex;flex-direction:column;gap:36px}
h1{font-size:clamp(28px,4vw,40px);font-weight:800;letter-spacing:-.02em;line-height:1.05;margin:0;text-wrap:balance}
.lede{max-width:64ch;color:var(--ink-2);margin:10px 0 0;font-size:16px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px 18px;box-shadow:var(--shadow)}
.tile.lead{background:var(--ink);color:var(--bar-ink);border-color:var(--ink)}
.tile .n{font-family:var(--mono);font-size:32px;font-weight:600;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.tile.lead .n{color:var(--lime)}
.tile .l{font-size:12.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-top:8px}
.tile.lead .l{color:var(--bar-soft)}
.tile .sub{font-size:13px;color:var(--ink-3);margin-top:4px}
.tile.lead .sub{color:var(--bar-soft)}
.note{background:var(--panel-alt);border-left:3px solid var(--accent);padding:12px 16px;border-radius:0 8px 8px 0;max-width:72ch;color:var(--ink-2);font-size:14px;margin:0}
h2{font-size:22px;font-weight:700;letter-spacing:-.015em;margin:0}
.prompt-box{background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);overflow:hidden;margin-top:12px}
.prompt-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--panel-alt);flex-wrap:wrap}
.prompt-head p{margin:0;font-size:13.5px;color:var(--ink-2)}
button{font:inherit;font-weight:600;font-size:13px;background:var(--ink);color:var(--bar-ink);border:0;border-radius:6px;padding:8px 14px;cursor:pointer}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
pre{margin:0;padding:18px;white-space:pre-wrap;font-family:var(--mono);font-size:12.5px;line-height:1.55;color:var(--ink-2);max-height:420px;overflow:auto}
.jump{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.jump a{font-size:13px;color:var(--ink-2);background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:5px 12px;text-decoration:none}
.jump a:hover{border-color:var(--line-strong);color:var(--ink)}
.week{display:flex;flex-direction:column;gap:14px}
.week-head{border-bottom:2px solid var(--ink);padding-bottom:8px;display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap}
.week-line{margin:0;color:var(--ink-2);font-size:14px}
.races{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:14px}
@media (max-width:520px){.races{grid-template-columns:1fr}}
.race{background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);padding:14px 16px 12px;display:flex;flex-direction:column;gap:10px;min-width:0}
.race.g1{border-color:var(--ink);border-width:2px}
.race-head{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:baseline}
.grade{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--accent)}
.g1 .grade{background:var(--lime);color:#14161a;padding:2px 6px;border-radius:4px}
.race-head h3{margin:0;font-size:17px;font-weight:700;letter-spacing:-.01em}
.meta{grid-column:1/-1;font-size:12.5px;color:var(--ink-3)}
.board-wrap{overflow-x:auto}
.board{width:100%;border-collapse:collapse;font-size:14px}
.board th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;text-align:left;padding:0 6px 6px;border-bottom:1px solid var(--line)}
.board td{padding:6px 6px;border-bottom:1px solid var(--line);vertical-align:middle}
.board tr:last-child td{border-bottom:0}
.board .rk{width:22px;color:var(--muted);font-family:var(--mono);font-size:12px}
.board .no{width:34px}
.cloth{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:5px;background:var(--ink);color:var(--bar-ink);font-family:var(--mono);font-weight:600;font-size:13px}
.board .name{display:block;font-weight:600}
.board .jockey{display:block;font-size:12px;color:var(--ink-3)}
.board .num{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
.board th.num{text-align:right}
.board .call{width:62px;text-align:center}
.chip{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:3px 8px;border-radius:4px;line-height:1.2}
.chip.prime{background:var(--lime);color:#14161a}
.chip.bet{background:var(--blue);color:#fff}
.chip.lay{background:var(--red);color:#fff}
tr.won td{background:var(--blue-soft)}
tr.won-top td{background:var(--lime-soft)}
tr.also td{color:var(--ink-2)}
.verdict{margin:0;font-size:13px;color:var(--ink-3);font-style:italic}
.result{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;background:var(--surface);border-radius:6px;padding:8px 10px;font-size:13px}
.result-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}
.placing b{font-family:var(--mono);color:var(--ink-3);font-weight:600;margin-right:2px}
.placing i{font-style:normal;font-family:var(--mono);color:var(--ink-3);font-size:12px}
.ours{margin-left:auto;font-weight:700;font-size:12.5px;padding:2px 8px;border-radius:4px}
.ours.hit-top{background:var(--lime);color:#14161a}
.ours.hit{background:var(--blue);color:#fff}
.ours.miss{color:var(--ink-3);border:1px solid var(--line-strong)}
.settle{margin:0;display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;font-family:var(--mono)}
.settle .up{color:var(--accent)}
.settle .down{color:var(--red)}
.foot{color:var(--ink-3);font-size:13px;max-width:72ch}
</style>
<div class="bar"><span class="wordmark">The Overlay</span><span>Season record, 1 Aug to 12 Sep 2026, every black-type race in NSW, VIC and QLD</span></div>
<div class="wrap">
  <div>
    <h1>What the board would have said</h1>
    <p class="lede">Every Group and Listed race this season, run through the model on the form as it stood and the last best price before the jump. Nothing here is hand-picked.</p>
  </div>
  <div class="tiles">
    <div class="tile lead"><div class="n">${top4Wins} of ${races.length}</div><div class="l">Winners in our top four</div><div class="sub">${Math.round((100 * top4Wins) / races.length)}% of black-type races</div></div>
    <div class="tile"><div class="n">${races.filter((r) => r.winnerRank === 1).length} of ${races.length}</div><div class="l">Rated #1 won</div><div class="sub">${Math.round((100 * races.filter((r) => r.winnerRank === 1).length) / races.length)}% strike rate</div></div>
    <div class="tile"><div class="n">${g1.filter((r) => r.winnerRank).length} of ${g1.length}</div><div class="l">Group 1 winners in our four</div><div class="sub">${g1.map((r) => `${shortName(r.raceName).replace(" Stakes", "")} #${r.winnerRank ?? "–"}`).join(", ")}</div></div>
    <div class="tile"><div class="n">${races.filter((r) => inTop(r, 2)).length} of ${races.length}</div><div class="l">Quinella inside our four</div><div class="sub">${races.filter((r) => inTop(r, 3)).length} with the first three home</div></div>
    <div class="tile"><div class="n">${bets.filter((c) => c.won).length} of ${bets.length}</div><div class="l">Bets won</div><div class="sub">${units(sum(bets))} at level stakes</div></div>
    <div class="tile"><div class="n">${lays.filter((c) => !c.won).length} of ${lays.length}</div><div class="l">Lays held</div><div class="sub">${units(sum(lays))}, one unit a lay</div></div>
  </div>
  <p class="note">The top four record is the story. The bet record is real and poor in this sample, so post it small and honest rather than leave it out. Market prices are the last best bookmaker price before the jump, not a Thursday price.</p>

  <section>
    <h2>Claude Design prompt</h2>
    <div class="prompt-box">
      <div class="prompt-head"><p>Paste this into Claude Design, then paste the season record (marketing/season-record.md) after it as the data.</p><button id="copy-prompt" type="button">Copy prompt</button></div>
      <pre id="prompt-text">${esc(prompt)}</pre>
    </div>
  </section>

  <section>
    <h2>Week by week</h2>
    <nav class="jump" aria-label="Jump to a Saturday">${[...byDate.keys()].map((d) => `<a href="#w${d}">${new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</a>`).join("")}</nav>
  </section>
  ${weeks}
  <p class="foot">Rated prices are ours. Market is the best bookmaker price at the last fluctuation before the jump. SP is the official starting price. A bet is settled at the market price for one unit, a lay at the market price for one unit of stake. Lime row: winner was our #1. Blue row: winner was in our top four.</p>
</div>
<script>
document.getElementById("copy-prompt").addEventListener("click", async () => {
  const b = document.getElementById("copy-prompt");
  try { await navigator.clipboard.writeText(document.getElementById("prompt-text").textContent); b.textContent = "Copied"; }
  catch { b.textContent = "Select and copy"; }
  setTimeout(() => (b.textContent = "Copy prompt"), 1800);
});
</script>
`;
writeFileSync("marketing/season-brief.html", html);
console.log("wrote marketing/season-brief.html", html.length);
