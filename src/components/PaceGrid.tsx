import { Badge } from "./Badge";
import { Section } from "./Section";
import { MAP_LABEL, TEMPO_LABEL } from "./Ratings";
import { percent, price } from "@/lib/format";
import type { MapPosition, PublishedRace } from "@/lib/model/types";

/** The field runs left to right: backmarkers on the left, the leader out in front on the right. */
const COLUMNS: MapPosition[] = ["back", "midfield", "on pace", "leader"];

const PRESSURE_TIP =
  "Pressure is how much early speed is in the race: the average early-speed score of the three quickest beginners, from the speed map or their settling positions in past runs. Above 82% we call the tempo fast, below 62% slow.";

/** Where we expect each runner to settle, with the tempo call on top. */
export function PaceGrid({
  race,
  rail,
  locked,
}: {
  race: PublishedRace;
  rail?: string;
  locked?: boolean;
}) {
  const live = race.runners
    .filter((r) => !r.scratched)
    .sort((a, b) => a.ratings.ppir - b.ratings.ppir);
  const tone =
    race.pace.tempo === "fast"
      ? "warn"
      : race.pace.tempo === "slow"
        ? "muted"
        : "ok";

  return (
    <Section
      id="pace"
      letter="P"
      title="Pressure grid"
      controls={
        <span
          className="tip"
          data-tip="Our call on how the race will be run up front, from the pressure score and Form King's expected tempo where we have it."
        >
          <Badge tone={tone}>{TEMPO_LABEL[race.pace.tempo]} tempo</Badge>
        </span>
      }
      aside={
        <span className="nums tip tip-right cursor-help" data-tip={PRESSURE_TIP}>
          Pressure {percent(race.pace.pressure)}
        </span>
      }
    >
      <div className="section-body grid grid-cols-2 md:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const group = live.filter((r) => r.ratings.map === col);
          return (
            <div key={col}>
              <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft mb-2">
                {MAP_LABEL[col]}
              </div>
              {/* A section with more than three runners wraps into two columns so
                the map stays short instead of one long column. */}
              <ul
                className={`grid gap-1 ${group.length > 3 ? "grid-cols-2" : "grid-cols-1"}`}
              >
                {group.map((r) => (
                  <li
                    key={r.tabNumber}
                    className={`grid-chip ${
                      locked
                        ? ""
                        : r.signal === "back"
                          ? "is-back"
                          : r.signal === "lay"
                            ? "is-lay"
                            : ""
                    }`}
                  >
                    <span className="truncate">
                      {r.tabNumber}. {r.horseName}{" "}
                      <span className="text-ink-soft font-normal">
                        (B{r.barrier})
                      </span>
                    </span>
                    <span
                      className={`nums shrink-0 text-xs ${
                        !locked && r.signal === "back"
                          ? "text-blue"
                          : !locked && r.signal === "lay"
                            ? "text-red"
                            : "text-ink-soft"
                      }`}
                    >
                      {price(r.marketPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="rail">
        <span className="rail-label">Rail{rail ? ` ${rail}` : ""}</span>
      </div>
    </Section>
  );
}
