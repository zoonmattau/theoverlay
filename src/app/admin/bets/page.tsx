import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { myBets, type MyBet } from "@/lib/my-bets";
import { addBet, removeBet } from "./actions";

export const metadata: Metadata = { title: "My bets", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/admin/bets">) {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Bets searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (cents: number) => (cents > 0 ? `+${money(cents)}` : money(cents));
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" });
const ERRORS: Record<string, string> = {
  fill: "Fill in the date, horse, stake and a price above $1.",
  nohorse: "No runner by that name on that date's card. Check the spelling or the date.",
  many: "That name fits more than one runner that day. Type more of it.",
};

/** Your own bets, settled from our results, with the totals overall and by account. */
async function Bets({ searchParams }: { searchParams: PageProps<"/admin/bets">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  if (!isAdmin(viewer) || !viewer.id) notFound();
  const bets = await myBets(viewer.id);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const settled = bets.filter((b) => b.result && b.result !== "void");
  const staked = settled.reduce((a, b) => a + b.stake_cents, 0);
  const profit = settled.reduce((a, b) => a + (b.profit_cents ?? 0), 0);
  const pending = bets.filter((b) => !b.result);
  const accounts = [...new Set(bets.map((b) => b.account ?? "No account"))];

  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">My bets</h1>
        <p className="mt-1 text-sm text-ink-soft">Your own bets, matched to our card and settled from the result. Only you see these.</p>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat n={signed(profit)} label="profit" tone={profit > 0 ? "prime" : profit < 0 ? "red" : undefined} />
        <Stat n={staked ? `${((profit / staked) * 100).toFixed(1)}%` : "–"} label="return on stakes" />
        <Stat n={money(staked)} label={`staked, ${settled.length} settled`} />
        <Stat n={String(pending.length)} label="waiting on a result" />
      </div>

      <div className="card mb-6">
        <h2 className="font-display font-extrabold">Add a bet</h2>
        {str("error") && <p className="mt-2 text-sm text-red">{ERRORS[str("error")] ?? "Something was missing."}</p>}
        <form action={addBet} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="field"><span>Race day</span><input type="date" name="date" defaultValue={str("date") || today} required className="field-input" /></label>
          <label className="field flex-1 min-w-48"><span>Horse</span><input name="horse" defaultValue={str("horse")} required placeholder="Bangkok Hottie" className="field-input w-full" /></label>
          <label className="field"><span>Bet</span>
            <select name="kind" defaultValue={str("kind") || "win"} className="field-input">
              <option value="win">Win</option>
              <option value="place">Place</option>
              <option value="lay">Lay</option>
            </select>
          </label>
          <label className="field"><span>Stake, $</span><input name="stake" defaultValue={str("stake")} inputMode="decimal" required placeholder="50" className="field-input w-24" /></label>
          <label className="field"><span>Price</span><input name="odds" defaultValue={str("odds")} inputMode="decimal" required placeholder="3.10" className="field-input w-24" /></label>
          <label className="field"><span>Account</span><input name="account" defaultValue={str("account")} list="bet-accounts" placeholder="Keisha's SB" className="field-input w-40" /></label>
          <datalist id="bet-accounts">{accounts.filter((a) => a !== "No account").map((a) => <option key={a} value={a} />)}</datalist>
          <button type="submit" className="btn btn-primary btn-sm">Add</button>
        </form>
        <p className="mt-2 text-xs text-ink-soft">A lay&apos;s stake is the backer&apos;s stake you accept; a place bet takes the place price. Each way goes in as a win and a place.</p>
      </div>

      {accounts.length > 1 && (
        <div className="card mb-6">
          <h2 className="font-display font-extrabold mb-2">By account</h2>
          <table className="data-table stack-sm text-sm">
            <thead><tr><th>Account</th><th className="text-right">Bets</th><th className="text-right">Staked</th><th className="text-right">Profit</th></tr></thead>
            <tbody>
              {accounts.map((a) => {
                const mine = settled.filter((b) => (b.account ?? "No account") === a);
                const p = mine.reduce((x, b) => x + (b.profit_cents ?? 0), 0);
                return (
                  <tr key={a}>
                    <td>{a}</td>
                    <td data-label="Bets" className="text-right nums">{mine.length}</td>
                    <td data-label="Staked" className="text-right nums">{money(mine.reduce((x, b) => x + b.stake_cents, 0))}</td>
                    <td data-label="Profit" className={`text-right nums font-semibold ${p > 0 ? "text-accent" : p < 0 ? "text-red" : ""}`}>{signed(p)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card mb-6">
        <h2 className="font-display font-extrabold mb-2">Every bet</h2>
        {bets.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing yet.</p>
        ) : (
          <table className="data-table stack-sm text-sm">
            <thead><tr><th>Day</th><th>Runner</th><th>Bet</th><th>Account</th><th className="text-right">Result</th><th className="text-right">Profit</th><th></th></tr></thead>
            <tbody>{bets.map((b) => <Row key={b.id} b={b} />)}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Row({ b }: { b: MyBet }) {
  const tone = b.result === "won" ? "text-accent" : b.result === "lost" ? "text-red" : "text-ink-soft";
  return (
    <tr>
      <td className="nums whitespace-nowrap">{day(b.date)}</td>
      <td data-label="Runner">
        {b.meeting_id ? <Link href={`/racing/${b.date}/${b.meeting_id}/${b.race_id}`} className="font-semibold hover:text-blue">{b.horse}</Link> : <span className="font-semibold">{b.horse}</span>}
        <span className="text-ink-soft"> · {b.track} R{b.race_number}</span>
      </td>
      <td data-label="Bet" className="nums whitespace-nowrap">{b.kind === "lay" ? "Lay" : b.kind === "place" ? "Place" : "Win"} {money(b.stake_cents)} @ ${b.odds.toFixed(2)}</td>
      <td data-label="Account" className="text-ink-secondary">{b.account ?? ""}</td>
      <td data-label="Result" className={`text-right whitespace-nowrap font-semibold ${tone}`}>
        {b.result === "void" ? "Void" : b.result ? `${b.result === "won" ? "Won" : "Lost"}${b.finish_position ? `, ran ${ordinal(b.finish_position)}` : ""}` : "Waiting"}
      </td>
      <td data-label="Profit" className={`text-right nums font-semibold ${tone}`}>{b.result ? signed(b.profit_cents ?? 0) : ""}</td>
      <td className="text-right">
        <form action={removeBet}><input type="hidden" name="id" value={b.id} /><button type="submit" className="text-xs text-ink-soft underline">Remove</button></form>
      </td>
    </tr>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

function Stat({ n, label, tone }: { n: string; label: string; tone?: "prime" | "red" }) {
  const cls = tone === "prime" ? "border-lime bg-lime-soft" : tone === "red" ? "border-red bg-red-soft" : "";
  return (
    <div className={`card text-center ${cls}`}>
      <div className="font-display text-2xl font-extrabold tracking-tight nums">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-ink-soft mt-1">{label}</div>
    </div>
  );
}
