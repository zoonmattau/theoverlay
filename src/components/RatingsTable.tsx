import { TipChip } from "./Badge";
import { MAP_LABEL } from "./Ratings";
import type { PublishedRace } from "@/lib/model/types";

/**
 * A cell on the red-to-green scale: red well below par, white at par, green
 * well above, six points either side being the ends of the scale.
 */
function Cell({ value, par, strong }: { value: number; par: number; strong?: boolean }) {
  const t = Math.max(-1, Math.min(1, (value - par) / 6));
  // Red 217,54,54 through white to green 111,154,18, mixed as a tint so the number stays readable.
  const alpha = Math.abs(t) * 0.55;
  const background = t < 0 ? `rgba(217, 54, 54, ${alpha})` : `rgba(111, 154, 18, ${alpha})`;
  return (
    <td className={`text-right nums ${strong ? "font-semibold" : ""}`} style={{ background }} title={`${value >= par ? "+" : ""}${(value - par).toFixed(1)} against par`}>
      {value.toFixed(1)}
    </td>
  );
}

/** Every runner's category ratings, ranked on today's number. */
export function RatingsTable({ race, bare }: { race: PublishedRace; bare?: boolean }) {
  const par = race.classPoints;
  const rows = race.runners
    .filter((r) => !r.scratched)
    .sort((a, b) => b.ratings.today - a.ratings.today);

  const tempoKey = race.pace.tempo === "slow" ? "slow" : "fast";

  return (
    <div className={bare ? "" : "card p-0 overflow-hidden"}>
      {!bare && (
        <div className="panel-head px-4 pt-4 mb-0">
          <h2>Ratings</h2>
          <span className="text-xs text-muted nums">Par {par}</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="data-table min-w-[960px] text-sm">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Runner</th>
              <th className="text-right">Today</th>
              <th className="text-right">Class</th>
              <th className="text-right">Early</th>
              <th className="text-right">Mid</th>
              <th className="text-right">Late</th>
              <th className="text-right">Press</th>
              <th className="text-right">{tempoKey} tempo</th>
              <th className="text-right">{race.going}</th>
              <th className="text-right">Dist</th>
              <th className="text-right">Track</th>
              <th>Map</th>
              <th className="text-right">Runs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const g = r.ratings;
              return (
                <tr key={r.tabNumber}>
                  <td className="nums text-ink-soft">{r.tabNumber}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <TipChip r={r} />
                      <span className="font-medium truncate">{r.horseName}</span>
                    </div>
                  </td>
                  <Cell value={g.today} par={par} strong />
                  <Cell value={g.class} par={par} />
                  <Cell value={g.early} par={par} />
                  <Cell value={g.mid} par={par} />
                  <Cell value={g.late} par={par} />
                  <Cell value={g.pressure} par={par} />
                  <Cell value={g.tempo[tempoKey]} par={par} />
                  <Cell value={g.going[race.going]} par={par} />
                  <Cell value={g.distance} par={par} />
                  <Cell value={g.track} par={par} />
                  <td className="text-xs text-ink-secondary whitespace-nowrap">
                    {MAP_LABEL[g.map]}
                  </td>
                  <td className="text-right nums text-muted">{g.runs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line bg-bg-soft px-4 py-2 text-xs text-ink-soft">
        Ratings are in benchmark points on the same scale as the race class. Green is above par, red below, deeper the further from it.
      </p>
    </div>
  );
}
