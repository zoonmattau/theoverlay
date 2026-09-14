// Turns scripts/out/tip-of-week.json into marketing/saturday-wraps.md: one
// Saturday per section, every bet and lay settled, the day's totals.
// node scripts/wraps-brief.mjs > marketing/saturday-wraps.md
import { readFileSync } from "node:fs";

const weeks = JSON.parse(readFileSync("scripts/out/tip-of-week.json", "utf8"));
const day = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fin = (n) => (n === 1 ? "Won" : n === 2 ? "2nd" : n === 3 ? "3rd" : n ? `${n}th` : "Unplaced");
const u = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}u`;
const label = (t) => (t === "top_overlay" ? "Overlay of the Day" : t === "prime_overlay" ? "Prime Overlay" : t === "long_overlay" ? "Long Overlay" : t === "lay" ? "Lay" : "Bet");

const out = ["# The Overlay, Saturday wraps, 1 Aug to 12 Sep 2026", "", "Every bet and lay the model called on each Saturday card (NSW, VIC, QLD), settled at the last best price before the jump, one unit a bet. Backtest: the model run on the form and prices as they stood."];
let tb = 0, tl = 0, nb = 0, nl = 0, wb = 0, hl = 0;
for (const w of weeks) {
  const bets = w.bets, lays = w.lays;
  tb += w.betUnits; tl += w.layUnits; nb += bets.length; nl += lays.length; wb += bets.filter((c) => c.won).length; hl += lays.filter((c) => !c.won).length;
  out.push("", `## ${day(w.date)}`, "");
  out.push(`Bets: ${bets.length} placed, ${bets.filter((c) => c.won).length} won, ${u(w.betUnits)}`);
  out.push(`Lays: ${lays.length} placed, ${lays.filter((c) => !c.won).length} held, ${u(w.layUnits)}`);
  out.push(`Day: ${u(w.betUnits + w.layUnits)}`);
  const best = [...bets].filter((c) => c.won).sort((a, b) => b.units - a.units)[0];
  if (best) out.push(`Best result: ${best.horse} won at $${best.market}, ${best.track} R${best.raceNumber}`);
  out.push("", "| Type | Race | Runner | Price | Rated | Result | Units |", "|---|---|---|---|---|---|---|");
  for (const c of [...bets, ...lays]) out.push(`| ${label(c.tag)} | ${c.track} R${c.raceNumber} | ${c.tab}. ${c.horse} | $${c.market} | $${c.rated} | ${fin(c.finish)} | ${u(c.units)} |`);
}
out.push("", "## Season to date", "", `Bets: ${nb} placed, ${wb} won, ${u(tb)}`, `Lays: ${nl} placed, ${hl} held, ${u(tl)}`, `Net: ${u(tb + tl)}`);
console.log(out.join("\n"));
