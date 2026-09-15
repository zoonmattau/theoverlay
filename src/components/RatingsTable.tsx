import { TipChip } from "./Badge";
import { MapHover } from "./MapHover";
import { MAP_LABEL } from "./Ratings";
import type { PublishedRace } from "@/lib/model/types";

/**
 * A cell on the red-to-green scale: red well below the race average for that
 * column, white at it, green well above, six points either side being the
 * ends of the scale. Relative to the field, so the best in the race is green
 * whatever the class.
 */
function Cell({ value, par, avg, strong }: { value: number; par: number; avg: number; strong?: boolean }) {
  const t = Math.max(-1, Math.min(1, (value - avg) / 6));
  // Red 217,54,54 through white to green 111,154,18, mixed as a tint so the number stays readable.
  const alpha = Math.abs(t) * 0.55;
  const background = t < 0 ? `rgba(217, 54, 54, ${alpha})` : `rgba(111, 154, 18, ${alpha})`;
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
  return (
    <td className={`text-right nums tip tip-right cursor-help ${strong ? "font-semibold" : ""}`} style={{ background }} data-tip={`${signed(value - par)} v par
${signed(value - avg)} v avg`}>
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

  const tempo = race.pace.tempo;
  const tempoOf = (g: { tempo: { fast: number; slow: number } }) => (tempo === "slow" ? g.tempo.slow : tempo === "fast" ? g.tempo.fast : (g.tempo.fast + g.tempo.slow) / 2);
  // The race average of each column, for the hover.
  const mean = (pick: (g: (typeof rows)[number]["ratings"]) => number) => rows.reduce((a, r) => a + pick(r.ratings), 0) / Math.max(1, rows.length);
  const avg = {
    today: mean((g) => g.today), class: mean((g) => g.class), early: mean((g) => g.early), mid: mean((g) => g.mid), late: mean((g) => g.late),
    pressure: mean((g) => g.pressure), tempo: mean((g) => tempoOf(g)), going: mean((g) => g.going[race.going]), distance: mean((g) => g.distance), track: mean((g) => g.track),
  };

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
              <th className="text-right">{tempo === "even" ? "Tempo" : `${tempo} tempo`}</th>
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
                  <Cell value={g.today} par={par} avg={avg.today} strong />
                  <Cell value={g.class} par={par} avg={avg.class} />
                  <Cell value={g.early} par={par} avg={avg.early} />
                  <Cell value={g.mid} par={par} avg={avg.mid} />
                  <Cell value={g.late} par={par} avg={avg.late} />
                  <Cell value={g.pressure} par={par} avg={avg.pressure} />
                  <Cell value={tempoOf(g)} par={par} avg={avg.tempo} />
                  <Cell value={g.going[race.going]} par={par} avg={avg.going} />
                  <Cell value={g.distance} par={par} avg={avg.distance} />
                  <Cell value={g.track} par={par} avg={avg.track} />
                  <td className="text-xs text-ink-secondary whitespace-nowrap">
                    <MapHover race={race} runner={r}><span className="cursor-help underline decoration-dotted underline-offset-2">{MAP_LABEL[g.map]}</span></MapHover>
                  </td>
                  <td className="text-right nums text-muted">{g.runs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line bg-bg-soft px-4 py-2 text-xs text-ink-soft">
        Ratings are in benchmark points on the same scale as the race class. Green is above the race average for that column, red below, deeper the further from it.
      </p>
    </div>
  );
}
