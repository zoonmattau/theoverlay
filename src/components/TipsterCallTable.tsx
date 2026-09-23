import Link from "next/link";

import { Outcome } from "./SelectionCard";
import { priceFlagged, stakeLabel, struckAt, type CreatorTip, type Tipster } from "@/lib/creators";
import { jumpTime, price } from "@/lib/format";

const units = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(2)}`;

/**
 * Followed tipsters' calls in the same table as the model's bets under them:
 * race, jump, who called it when there is more than one tipster, runner,
 * the price they took, the price they rate, the call, the result, the units
 * and the running sum. The reason opens off the runner.
 */
export function TipsterCallTable({ tips, jumps }: { tips: (CreatorTip & { tipster?: Tipster })[]; /** Jump time by race id, for the calls still to run. */ jumps: Map<string, string | undefined> }) {
  const ordered = [...tips].sort((a, b) => (jumps.get(a.race_id) ?? "").localeCompare(jumps.get(b.race_id) ?? "") || a.race_number - b.race_number);
  const many = new Set(tips.map((t) => t.affiliate_id)).size > 1;
  const total = ordered.reduce((a, t) => a + (t.settled_at ? Number(t.units) : 0), 0);
  const staked = ordered.reduce((a, t) => a + Number(t.stake ?? 1), 0);
  return (
    <div className="overflow-x-auto">
      <table className="data-table text-sm min-w-[880px]">
        <thead>
          <tr>
            <th data-col="race">Race</th>
            <th data-col="jump">Jump</th>
            {many && <th data-col="who">Tipster</th>}
            <th data-col="runner">Runner</th>
            <th data-col="live" className="text-right">Price</th>
            <th data-col="rated" className="text-right">Rated</th>
            <th data-col="edge" className="text-right">Call</th>
            <th data-col="result">Result</th>
            <th data-col="pl" className="text-right">P/L</th>
            <th data-col="sum" className="text-right">Sum</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((t, i) => {
            const sofar = ordered.slice(0, i + 1);
            const running = sofar.reduce((a, x) => a + (x.settled_at ? Number(x.units) : 0), 0);
            const anySettled = sofar.some((x) => x.settled_at);
            const u = t.settled_at ? Number(t.units) : undefined;
            const jump = jumps.get(t.race_id);
            const href = `/racing/${t.date}/${encodeURIComponent(t.meeting_id)}/${encodeURIComponent(t.race_id)}`;
            return (
              <tr key={t.id} className="tip-row">
                <td data-col="race" className="whitespace-nowrap">
                  <Link href={href} className="font-semibold hover:text-blue">{t.track} R{t.race_number}</Link>
                </td>
                <td data-col="jump" className="nums text-ink-soft whitespace-nowrap">{t.settled_at ? "Run" : jump ? jumpTime(jump) : ""}</td>
                {many && (
                  <td data-col="who" className="whitespace-nowrap">
                    {t.tipster ? <Link href={`/t/${t.tipster.code}`} className="font-semibold hover:text-blue">{t.tipster.name}</Link> : ""}
                  </td>
                )}
                <td data-col="runner">
                  {/* On a phone the Tipster column is hidden, so the name sits over the runner. */}
                  {many && t.tipster && <span className="block sm:hidden text-[11px] text-ink-soft">{t.tipster.name}</span>}
                  <span className="flex items-center gap-2">
                    <span className="font-semibold" data-tip={t.comment ?? undefined}>{t.tab_number}. {t.horse_name}</span>
                    {t.comment && <span className="call-why sm:hidden" data-tip={t.comment}>why</span>}
                    {priceFlagged(t) && <span className="badge badge-warn" data-tip={`Best price we saw when posted was ${price(Number(t.market_at_post))}`}>over market</span>}
                  </span>
                </td>
                <td data-col="live" className="text-right">
                  <span className={`price-chip ${t.side === "lay" ? "is-lay" : "is-back"}`}>{price(struckAt(t))}</span>
                  {t.bookie && <span className="block text-[10px] mt-0.5 text-ink-soft">{t.bookie}</span>}
                </td>
                <td data-col="rated" className="text-right nums font-semibold whitespace-nowrap">{price(Number(t.price))}</td>
                <td data-col="edge" className="text-right whitespace-nowrap">
                  <span className={`badge ${t.side === "lay" ? "badge-lay" : "badge-back"}`}>{t.side === "lay" ? "Lay" : "Bet"}{stakeLabel(t) ? ` ${stakeLabel(t)}` : ""}</span>
                </td>
                <td data-col="result">
                  {t.settled_at ? (
                    <span className="flex items-center gap-2">
                      <Outcome position={t.finish_position} />
                      {t.side === "lay" && t.finish_position !== null && (
                        <span className={`text-xs font-bold ${t.finish_position === 1 ? "text-red" : "text-accent"}`}>{t.finish_position === 1 ? "lay lost" : "lay held"}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-soft">to run</span>
                  )}
                </td>
                <td data-col="pl" data-pending={u === undefined ? "1" : undefined} className={`text-right nums font-semibold ${u === undefined ? "text-ink-soft" : u > 0 ? "text-accent" : u < 0 ? "text-red" : ""}`}>
                  {u === undefined ? "—" : units(u)}
                </td>
                <td data-col="sum" className={`text-right nums ${running > 0 ? "text-accent" : running < 0 ? "text-red" : "text-ink-soft"}`}>{anySettled ? units(running) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="tip-total">
            <td colSpan={many ? 8 : 7} className="text-right text-xs uppercase tracking-[0.06em] font-bold text-ink-soft">Total, {staked % 1 ? staked.toFixed(2) : staked} {staked === 1 ? "unit" : "units"} staked</td>
            <td className={`text-right nums font-extrabold ${total > 0 ? "text-accent" : total < 0 ? "text-red" : ""}`}>{units(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
