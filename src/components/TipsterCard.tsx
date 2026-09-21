import type { TipsterProfile } from "@/lib/creators";
import { price } from "@/lib/format";

export const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}u`;
export const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n * 100).toFixed(0)}%`;
const shortDate = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/**
 * One sentence on why you would follow them, from the numbers: the return,
 * how often they land one, the prices they play, and the reasons they give.
 */
export function whyFollow(p: TipsterProfile): string {
  if (p.all.n === 0) return p.posted ? `${p.posted} ${p.posted === 1 ? "call" : "calls"} posted, none settled yet.` : "No calls yet.";
  // A return on turnover means little until there are ten calls behind it.
  const parts = [`${units(p.all.units)} over ${p.all.n} ${p.all.n === 1 ? "call" : "calls"}${p.all.n >= 10 ? `, ${pct(p.all.roi)} on turnover` : ", early days"}`];
  if (p.bets.n) parts.push(`lands ${p.bets.hit} of ${p.bets.n} ${p.bets.n === 1 ? "bet" : "bets"}${p.avgPrice ? ` at ${price(p.avgPrice)} on average` : ""}`);
  if (p.lays.n) parts.push(`${p.lays.hit} of ${p.lays.n} ${p.lays.n === 1 ? "lay" : "lays"} held`);
  if (p.posted >= 5 && p.reasoned >= 0.8) parts.push("every call comes with a reason");
  return `${parts.join(", ")}.`;
}

/** "3 calls a week", or "a call most weeks" below one. */
export const perWeek = (n: number) => (n < 1 ? "a call most weeks" : `${Math.round(n)} ${Math.round(n) === 1 ? "call" : "calls"} a week`);

/**
 * The last ten settled calls as dots, newest on the right: lime landed, red
 * lost. Hover a dot (tap on a phone) for the call: the horse, the side, the
 * day and what it returned.
 */
export function FormDots({ recent }: { recent: TipsterProfile["recent"] }) {
  if (recent.length === 0) return <span className="text-xs text-ink-soft">No settled calls yet</span>;
  return (
    <span className="form-dots" data-tip={`The last ${recent.length} settled ${recent.length === 1 ? "call" : "calls"}, newest on the right. Hover a dot for the call.`}>
      {[...recent].reverse().map((r, i) => (
        <span key={i} className={`form-dot ${r.won ? "is-won" : "is-lost"}`} data-tip={`${r.side === "lay" ? "Lay" : "Bet"} ${r.horse}, ${shortDate(r.date)}: ${r.won ? "landed" : "lost"}, ${units(r.units)}`} />
      ))}
    </span>
  );
}
