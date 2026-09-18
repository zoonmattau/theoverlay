import { MatrixCell } from "./Countdown";
import { jumpTime } from "@/lib/format";
import { raceMix, raceTip, type PublishedMeeting, type Selection } from "@/lib/model/types";

/**
 * The day at a glance: one row per track, one column per race number. A
 * resulted race shows the first four home; one still to jump shows the
 * countdown and how many tips it carries.
 */
/** Colour the going chip by band so a wet track stands out down the column. */
export function goingClass(condition: string): string {
  const c = condition.toLowerCase();
  if (c.startsWith("heavy")) return "is-heavy";
  if (c.startsWith("soft")) return "is-soft";
  return "";
}

export function RaceMatrix({
  meetings,
  selections,
  date,
  freeRaceId,
  tipsters,
}: {
  meetings: PublishedMeeting[];
  selections: Selection[];
  date: string;
  /** Marked in the grid for viewers who cannot open the rest. */
  freeRaceId?: string;
  /** The tipsters the viewer follows, each with the races they have called. */
  tipsters?: { name: string; raceIds: string[] }[];
}) {
  const initialsFor = (raceId: string) => (tipsters ?? []).filter((t) => t.raceIds.includes(raceId)).map((t) => t.name.trim()[0]?.toUpperCase() ?? "?");
  const cols = Math.max(0, ...meetings.map((m) => m.races.length));
  const prime = new Set(selections.filter((s) => s.tag === "prime_overlay" || s.tag === "top_overlay").map((s) => s.raceId));

  return (
    <div className="matrix-wrap">
      <table className="matrix-table">
        <thead>
          <tr>
            <th className="matrix-track">Track</th>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i}>R{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meetings.map((m) => (
            <tr key={m.meetingId}>
              <td className="matrix-track">
                <div>
                  {m.track}
                  <span className="matrix-track-state">
                    {m.state}
                    {m.trackCondition && (
                      <span className={`going-chip ${goingClass(m.trackCondition)}`}>
                        {m.trackCondition}
                      </span>
                    )}
                  </span>
                </div>
              </td>
              {Array.from({ length: cols }, (_, i) => {
                const race = m.races[i];
                if (!race) {
                  return (
                    <td key={i} className="matrix-cell matrix-empty">
                      -
                    </td>
                  );
                }
                const backs = race.runners.filter((r) => r.signal === "back").length;
                const lays = race.runners.filter((r) => r.signal === "lay").length;
                return (
                  <td key={race.raceId} className="matrix-cell">
                    <MatrixCell
                      href={`/racing/${date}/${m.meetingId}/${race.raceId}`}
                      raceNumber={race.raceNumber}
                      iso={race.jumpTime}
                      clock={jumpTime(race.jumpTime)}
                      result={race.result}
                      backs={backs}
                      lays={lays}
                      tip={raceTip(race.runners, prime.has(race.raceId))}
                      mix={raceMix(race.runners, prime.has(race.raceId))}
                      group={groupOf(race.className, race.name)}
                      free={race.raceId === freeRaceId}
                      tipsters={initialsFor(race.raceId)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="legend border-t border-line px-4 py-3">
        <span className="font-bold uppercase tracking-[0.08em] text-[0.65rem]">Legend</span>
        <span><span className="legend-dot bg-lime" />Prime Overlay</span>
        <span><span className="legend-dot bg-blue" />Bet</span>
        <span><span className="legend-dot bg-blue-soft" />Way Overlay</span>
        <span><span className="legend-dot bg-red" />Lay</span>
        <span><span className="legend-dot legend-dot-mix" />Two colours, two kinds of call, each as wide as its share</span>
        <span><span className="legend-dot bg-surface-alt" />Resulted, first four, border shows what we had on</span>
        {tipsters && tipsters.length > 0 && <span><span className="legend-dot legend-dot-tipster" />{tipsters.map((t) => t.name).join(", ")}: a call in this race</span>}
      </div>
    </div>
  );
}

/** Group 1, 2 or 3 from the class or race name. */
export function groupOf(className?: string, name?: string): 1 | 2 | 3 | undefined {
  const m = `${className ?? ""} ${name ?? ""}`.match(/group\s?([123])|\bg([123])\b/i);
  if (!m) return undefined;
  return Number(m[1] ?? m[2]) as 1 | 2 | 3;
}
