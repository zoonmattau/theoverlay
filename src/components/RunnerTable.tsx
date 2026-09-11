import { SignalBadge } from "./Ratings";
import { Section } from "./Section";
import { percent, price, signedPercent } from "@/lib/format";
import type { PublishedRace } from "@/lib/model/types";

/**
 * The full field: our rated price against the market for every runner, with a
 * back or lay alert where the gap is big enough to act on.
 */
export function RunnerTable({ race, locked }: { race: PublishedRace; locked?: boolean }) {
  const runners = race.runners.filter((r) => !r.scratched);
  const scratched = race.runners.filter((r) => r.scratched);

  return (
    <Section id="market" letter="M" title="Market" aside={<span className="nums">{runners.length} runners</span>}>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[760px] text-sm">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Runner</th>
              <th className="text-right">Bar</th>
              {!locked && <th>Signal</th>}
              <th className="text-right">Wgt</th>
              <th>Jockey</th>
              <th>Form</th>
              {!locked && <th className="text-right">Win</th>}
              {!locked && <th className="text-right">Rated</th>}
              <th className="text-right">Live</th>
              {!locked && <th className="text-right">Edge</th>}
            </tr>
          </thead>
          <tbody>
            {runners.map((r) => (
              <tr key={r.tabNumber}>
                <td className="nums text-ink-soft">{r.tabNumber}</td>
                <td>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.horseName}</div>
                    <div className="text-[11px] text-muted truncate">{r.trainer ?? ""}</div>
                  </div>
                </td>
                <td className="text-right nums text-ink-secondary">{r.barrier}</td>
                {!locked && <td><SignalBadge signal={r.signal} /></td>}
                <td className="text-right nums text-ink-secondary">{r.weight ?? "—"}</td>
                <td className="text-ink-secondary truncate">{r.jockey ?? "—"}</td>
                <td className="nums text-ink-secondary">{r.form ?? "—"}</td>
                {!locked && <td className="text-right nums text-ink-secondary">{percent(r.ratedProbability)}</td>}
                {!locked && <td className="text-right nums font-semibold">{price(r.ratedPrice)}</td>}
                <td className="text-right">
                  <span className={`price-chip ${!locked && r.signal === "back" ? "is-back" : !locked && r.signal === "lay" ? "is-lay" : ""}`}>
                    {price(r.marketPrice)}
                  </span>
                </td>
                {!locked && <td className="text-right nums">
                  <span
                    className={
                      r.signal === "back"
                        ? "text-blue font-semibold"
                        : r.signal === "lay"
                          ? "text-red font-semibold"
                          : "text-muted"
                    }
                  >
                    {signedPercent(r.edge)}
                  </span>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line bg-panel-alt px-4 py-2 text-xs text-ink-soft space-y-1">
        {scratched.length > 0 && (
          <p className="text-muted">
            Scratched: {scratched.map((s) => `${s.tabNumber} ${s.horseName}`).join(", ")}
          </p>
        )}
        {locked ? (
          <p>Rated prices, edges and our bet or lay calls open with a pass.</p>
        ) : (
          <p>Edge is our win chance minus the market&apos;s, in points, and a bet or lay shows where it is big enough to act on.</p>
        )}
      </div>
    </Section>
  );
}
