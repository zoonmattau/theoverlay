import { Badge } from "./Badge";
import { Section } from "./Section";
import { MAP_LABEL, TEMPO_LABEL } from "./Ratings";
import { percent, price } from "@/lib/format";
import type { MapPosition, PublishedRace, PublishedRunner } from "@/lib/model/types";

/** The field runs left to right: backmarkers on the left, the leader out in front on the right. */
const COLUMNS: MapPosition[] = ["back", "midfield", "on pace", "leader"];

const PRESSURE_TIP =
  "Pressure is how much early speed is in the race: the average early-speed score of the three quickest beginners, from the speed map or their settling positions in past runs. Above 82% we call the tempo fast, below 62% slow.";

const ROW = 34;

/**
 * The speed map as a picture of the first 400m: every runner is a saddlecloth
 * placed by where we expect it to settle, the leader out on the right, low
 * barriers nearest the rail at the bottom, coloured by our call.
 */
export function PaceGrid({ race, rail, locked }: { race: PublishedRace; rail?: string; locked?: boolean }) {
  const live = race.runners.filter((r) => !r.scratched).sort((a, b) => a.ratings.ppir - b.ratings.ppir);
  const n = live.length;
  const tone = race.pace.tempo === "fast" ? "warn" : race.pace.tempo === "slow" ? "muted" : "ok";

  // Each runner sits in the column for where it settles, nudged right within
  // it by how far forward we have it, and stacked from the rail up with the
  // inside barriers at the bottom.
  const columns = COLUMNS.map((col) => {
    const group = live.filter((r) => r.ratings.map === col).sort((a, b) => b.barrier - a.barrier);
    return { col, group };
  });
  const lanes = Math.max(1, ...columns.map((c) => c.group.length));
  const nudge = (r: PublishedRunner) => (n > 1 ? Math.round(((n - r.ratings.ppir) / (n - 1)) * 100) % 25 : 0);

  return (
    <Section
      id="pace"
      letter="P"
      title="Speed map"
      controls={
        <span className="tip" data-tip="Our call on how the race will be run up front, from the pressure score and the expected tempo where we have it.">
          <Badge tone={tone}>{TEMPO_LABEL[race.pace.tempo]} tempo</Badge>
        </span>
      }
      aside={
        <span className="nums tip tip-right cursor-help" data-tip={PRESSURE_TIP}>
          Pressure {percent(race.pace.pressure)}
        </span>
      }
    >
      <div className="section-body">
        <div className="map-axis">
          {COLUMNS.map((c) => (
            <span key={c}>{MAP_LABEL[c]}</span>
          ))}
        </div>
        <div className="map-field" style={{ minHeight: lanes * ROW + 12 }}>
          {columns.map(({ col, group }) => (
            <div key={col} className="map-col">
              {group.map((r) => {
                const call = locked ? "" : r.prime ? "is-prime" : r.signal === "back" ? "is-back" : r.signal === "lay" ? "is-lay" : "";
                return (
                  <div
                    key={r.tabNumber}
                    className={`map-chip tip ${call}`}
                    style={{ marginLeft: `${nudge(r) * 1.6}%` }}
                    data-tip={`${r.horseName}, barrier ${r.barrier}. Settles ${MAP_LABEL[r.ratings.map].toLowerCase()}${locked ? "" : `, rated ${price(r.ratedPrice)} against ${price(r.marketPrice)}`}.`}
                  >
                    <span className="map-cloth">{r.tabNumber}</span>
                    <span className="map-name">{r.horseName}</span>
                    <span className="map-price nums">{price(r.marketPrice)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="rail">
          <span className="rail-label">Rail{rail ? ` ${rail}` : ""}</span>
          <span className="rail-arrow">running this way →</span>
        </div>
      </div>
    </Section>
  );
}
