// Turns scripts/out/backdate.json into the Instagram brief: a week-by-week
// list of every black-type race with the preview (our top four and calls) and
// the review (result, where our runners finished).
// node scripts/backdate-brief.mjs > marketing/season-record.md
import { readFileSync } from "node:fs";

const { races, calls } = JSON.parse(readFileSync("scripts/out/backdate.json", "utf8"));
const money = (p) => `$${p}`;
const fin = (n) => (n === 1 ? "WON" : n === 2 ? "2nd" : n === 3 ? "3rd" : n ? `${n}th` : "unplaced");
const day = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const gradeRank = { "Group 1": 0, "Group 2": 1, "Group 3": 2, Listed: 3 };

const byDate = new Map();
for (const r of races) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)).push(r);

const out = [];
for (const [date, rs] of byDate) {
  rs.sort((a, b) => gradeRank[a.grade] - gradeRank[b.grade] || a.track.localeCompare(b.track) || a.raceNumber - b.raceNumber);
  const top4 = rs.filter((r) => r.winnerRank).length;
  const firsts = rs.filter((r) => r.winnerRank === 1).length;
  out.push(`\n## ${day(date)} (${date})`);
  out.push(`${rs.length} black-type race${rs.length === 1 ? "" : "s"}. Winner in our top four: ${top4} of ${rs.length}. Rated #1 won: ${firsts}.`);
  for (const r of rs) {
    const rc = calls.filter((c) => c.date === r.date && c.track === r.track && c.raceNumber === r.raceNumber);
    out.push(`\n### ${r.grade} ${r.raceName.replace(/^(HKJC World Pool|Asahi Super Dry|Kia Ora Stud|Stow Storage|Crown|Charter Keck Cramer|Catanach's Jewellers|Catanach’s Jewellers|myPlates|Yulong|Toyota Forklifts|Irresistible Pools|Schweppes|Lexus|De Bortoli|Hyland Race Colours|Gold Coast Turf Club|Paramount Liquor|Tobin Brothers|Quayclean|The Quayclean|Evergreen Turf|TAB|Chandon|Canterbury-Hurlstone Park RSL|Smithfield RSL|MSC Signs|McMahon's Dairy|Ive > )\s*/i, "").trim()}, ${r.track} R${r.raceNumber}, ${r.distance}m, ${r.going}, $${Math.round((r.prize ?? 0) / 1000)}k`);
    out.push(`Sponsored name: ${r.raceName}`);
    out.push(`\nPREVIEW (what the board showed before the jump)`);
    for (const t of r.top4) {
      const tag = t.signal === "back" ? ((t.edge ?? 0) >= 0.05 ? "  PRIME OVERLAY" : "  BET") : t.signal === "lay" ? "  LAY" : "";
      out.push(`- #${t.rank}  ${t.tab}. ${t.horse}${t.jockey ? ` (${t.jockey})` : ""}  rated ${money(t.rated)}  market ${money(t.market ?? "-")}${tag}`);
    }
    for (const c of rc.filter((c) => !c.rank)) out.push(`- ${c.signal === "back" ? (c.prime ? "PRIME OVERLAY" : "BET") : "LAY"}  ${c.tab}. ${c.horse}  rated ${money(c.rated)}  market ${money(c.market)}`);
    out.push(`Verdict: ${r.verdict}`);
    out.push(`\nREVIEW (after the race)`);
    out.push(`Result: ${r.result.map((p) => `${p.pos}. ${p.horse}${p.sp ? ` (SP $${p.sp})` : ""}`).join(", ")}`);
    out.push(`Winner was our ${r.winnerRank ? `#${r.winnerRank}` : "unranked"} pick, rated ${money(r.winnerRated)}${r.winnerSp ? `, SP $${r.winnerSp}` : ""}.`);
    out.push(`Our top four finished: ${r.top4.map((t) => `#${t.rank} ${t.horse} ${fin(t.finish)}`).join(", ")}.`);
    if (rc.length) out.push(`Calls: ${rc.map((c) => `${c.signal === "back" ? "BET" : "LAY"} ${c.horse} at $${c.market} ${c.signal === "back" ? (c.won ? `WON, +${(c.market - 1).toFixed(2)}u` : `${fin(c.finish)}, -1u`) : c.won ? `it won, -${(c.market - 1).toFixed(2)}u` : `held (${fin(c.finish)}), +1u`}`).join("; ")}.`);
  }
}

const bets = calls.filter((c) => c.signal === "back"), lays = calls.filter((c) => c.signal === "lay");
const sum = (xs) => xs.reduce((a, c) => a + c.units, 0);
const g1 = races.filter((r) => r.grade === "Group 1");
const trif = races.filter((r) => { const t = new Set(r.top4.map((x) => x.tab)); return r.result.slice(0, 3).every((p) => t.has(p.tab)); });
const quin = races.filter((r) => { const t = new Set(r.top4.map((x) => x.tab)); return r.result.slice(0, 2).every((p) => t.has(p.tab)); });
const head = [
  `# The Overlay, season record, 1 Aug to 12 Sep 2026`,
  ``,
  `Every Group and Listed race in NSW, VIC and QLD, run through the model on the form as it stood and the last best price before the jump. Nothing here is hand-picked.`,
  ``,
  `- ${races.length} black-type races, ${g1.length} of them Group 1`,
  `- Winner in our top four: ${races.filter((r) => r.winnerRank).length} of ${races.length} (${Math.round((100 * races.filter((r) => r.winnerRank).length) / races.length)}%)`,
  `- Rated #1 won: ${races.filter((r) => r.winnerRank === 1).length} of ${races.length}`,
  `- Group 1 winners in our top four: ${g1.filter((r) => r.winnerRank).length} of ${g1.length} (${g1.map((r) => `${r.raceName.replace(/.*?(Winx|Memsie|Moir|Makybe Diva)/, "$1")} #${r.winnerRank ?? "-"}`).join(", ")})`,
  `- Quinella inside our top four: ${quin.length} of ${races.length}. First three home all in our top four: ${trif.length}`,
  `- Bets: ${bets.length}, won ${bets.filter((c) => c.won).length}, level stakes ${sum(bets) >= 0 ? "+" : ""}${sum(bets).toFixed(1)} units`,
  `- Lays: ${lays.length}, held ${lays.filter((c) => !c.won).length}, one unit a lay ${sum(lays) >= 0 ? "+" : ""}${sum(lays).toFixed(1)} units`,
];
console.log([...head, ...out].join("\n"));
