import { RankChip } from "./Badge";
import { MAP_LABEL, Points } from "./Ratings";
import type { PublishedRace } from "@/lib/model/types";

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
                      {r.rank ? <RankChip rank={r.rank} /> : <span className="w-5" />}
                      <span className="font-medium truncate">{r.horseName}</span>
                    </div>
                  </td>
                  <td className="text-right"><Points value={g.today} par={par} strong /></td>
                  <td className="text-right"><Points value={g.class} par={par} /></td>
                  <td className="text-right"><Points value={g.early} par={par} /></td>
                  <td className="text-right"><Points value={g.mid} par={par} /></td>
                  <td className="text-right"><Points value={g.late} par={par} /></td>
                  <td className="text-right"><Points value={g.pressure} par={par} /></td>
                  <td className="text-right"><Points value={g.tempo[tempoKey]} par={par} /></td>
                  <td className="text-right"><Points value={g.going[race.going]} par={par} /></td>
                  <td className="text-right"><Points value={g.distance} par={par} /></td>
                  <td className="text-right"><Points value={g.track} par={par} /></td>
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
        Ratings are in benchmark points on the same scale as the race class, so a 70 in a BM66 race is above par.
      </p>
    </div>
  );
}
