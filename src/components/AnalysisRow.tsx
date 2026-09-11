import { Badge } from "./Badge";
import { MAP_LABEL, SignalBadge, TEMPO_LABEL } from "./Ratings";
import { percent, price, priceWithChance, signedPercent } from "@/lib/format";
import type { PublishedRace } from "@/lib/model/types";

/** Three quick reads: the pace, where we see value, and who rates best. */
export function AnalysisRow({ race }: { race: PublishedRace }) {
  const live = race.runners.filter((r) => !r.scratched);
  const leaders = [...live].sort((a, b) => a.ratings.ppir - b.ratings.ppir).slice(0, 3);
  const topRated = [...live].sort((a, b) => b.ratings.today - a.ratings.today).slice(0, 3);
  // Bets first, then lays, each by the size of the edge.
  const overlays = live
    .filter((r) => r.signal)
    .sort((a, b) => {
      if (a.signal !== b.signal) return a.signal === "back" ? -1 : 1;
      return Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0);
    })
    .slice(0, 4);
  const tone = race.pace.tempo === "fast" ? "warn" : race.pace.tempo === "slow" ? "muted" : "ok";

  return (
    <div className="analysis-row">
      <div className="panel">
        <div className="panel-title">
          Race pressure
          <Badge tone={tone}>{TEMPO_LABEL[race.pace.tempo]} tempo</Badge>
          <span className="ml-auto text-xs text-ink-soft nums">{percent(race.pace.pressure)}</span>
        </div>
        {leaders.map((r) => (
          <div key={r.tabNumber} className="panel-row">
            <span>
              {r.tabNumber}. {r.horseName}
              <span className="text-ink-soft text-xs ml-1.5">{MAP_LABEL[r.ratings.map]}</span>
            </span>
            <span className="nums text-ink-soft">{price(r.marketPrice)}</span>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-title">
          Overlays
          <span className="ml-auto text-xs text-ink-soft">rated vs live, edge in points</span>
        </div>
        {overlays.length === 0 && <p className="text-sm text-ink-soft">Nothing to act on.</p>}
        {overlays.map((r) => (
          <div key={r.tabNumber} className="panel-row">
            <span className="flex items-center gap-2 min-w-0">
              <SignalBadge signal={r.signal} prime={r.prime} />
              <span className="truncate">
                {r.tabNumber}. {r.horseName}
              </span>
            </span>
            <span className="nums whitespace-nowrap">
              <span className="text-ink-soft">{priceWithChance(r.ratedPrice, r.ratedProbability)}</span>
              <span className="text-muted"> v </span>
              <span className={r.signal === "back" ? "text-blue font-bold" : "text-red font-bold"}>
                {price(r.marketPrice)}
              </span>
              <span className="text-ink-soft text-xs"> {signedPercent(r.edge)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-title">
          Top rated
          <span className="ml-auto text-xs text-ink-soft nums">par {race.classPoints}</span>
        </div>
        {topRated.map((r, i) => (
          <div key={r.tabNumber} className="panel-row">
            <span className="flex items-center gap-2 min-w-0">
              <span className="nums text-ink-soft">{i + 1}</span>
              <span className="truncate">
                {r.tabNumber}. {r.horseName}
              </span>
            </span>
            <span className="nums whitespace-nowrap">
              <span className="font-bold">{r.ratings.today.toFixed(1)}</span>
              <span className="text-ink-soft text-xs"> · {price(r.ratedPrice)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
