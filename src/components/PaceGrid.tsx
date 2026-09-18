import { Badge } from "./Badge";
import { Section } from "./Section";
import { MAP_LABEL, TEMPO_LABEL } from "./Ratings";
import { percent, price } from "@/lib/format";
import type { MapPosition, PublishedRace, PublishedRunner } from "@/lib/model/types";

const PRESSURE_TIP =
  "Pressure is how much early speed is in the race: the average early-speed score of the three quickest beginners, from the speed map or their settling positions in past runs. Above 82% we call the tempo fast, below 62% slow.";

/**
 * The field in running order, front to back: the leaders, then the rest in
 * pairs from where we expect each to settle, one three where the numbers
 * are odd, so nobody sits six wide. The lower barrier takes the rail.
 */
export function mapRows(live: PublishedRunner[]): PublishedRunner[][] {
  const order = [...live].sort((a, b) => a.ratings.ppir - b.ratings.ppir);
  const leaders = order.filter((r) => r.ratings.map === "leader");
  const rest = order.filter((r) => r.ratings.map !== "leader");
  const rows: PublishedRunner[][] = leaders.length ? [leaders] : [];
  const pairs = Math.floor(rest.length / 2);
  // The odd one out joins a pair in the middle of the field as a three.
  const triple = rest.length % 2 === 1 ? Math.floor(pairs / 2) : -1;
  let at = 0;
  for (let i = 0; i < pairs; i++) {
    const size = i === triple ? 3 : 2;
    rows.push(rest.slice(at, at + size));
    at += size;
  }
  if (at < rest.length) rows.push(rest.slice(at));
  return rows.map((row) => row.sort((a, b) => a.barrier - b.barrier));
}

/**
 * The speed map as a picture of the first 400m: every runner is a saddlecloth
 * placed by where we expect it to settle, the leader out on the right, the
 * rail along the bottom, coloured by our call.
 */
export function PaceGrid({ race, rail, locked }: { race: PublishedRace; rail?: string; locked?: boolean }) {
  const live = race.runners.filter((r) => !r.scratched);
  const tone = race.pace.tempo === "fast" ? "warn" : race.pace.tempo === "slow" ? "muted" : "ok";
  // Back of the field on the left, the leader on the right.
  const rows = mapRows(live).reverse();
  const zoneOf = (row: PublishedRunner[]): MapPosition => row[0]?.ratings.map ?? "midfield";
  const widest = Math.max(1, ...live.map((r) => r.barrier));
  /**
   * Where each runner in a column sits off the rail, in lanes from 0 (the
   * fence) to 2 (wide): its barrier as a share of the widest gate, then
   * anyone landing on top of the one below is lifted a lane.
   */
  const lanes = (row: PublishedRunner[]): Map<number, number> => {
    const out = new Map<number, number>();
    let floor = 0;
    for (const r of row) {
      const want = ((r.barrier - 1) / Math.max(1, widest - 1)) * 2;
      const lane = Math.min(2, Math.max(want, floor));
      out.set(r.tabNumber, lane);
      floor = lane + 1;
    }
    // Where the top was reached, the ones beneath drop a lane each so nobody overlaps.
    let ceiling = 3;
    for (const r of [...row].reverse()) {
      const lane = Math.min(out.get(r.tabNumber)!, ceiling - 1);
      out.set(r.tabNumber, lane);
      ceiling = lane;
    }
    return out;
  };

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
        <div className="map-scroll">
          <div className="map-strip" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
            {rows.map((row, i) => {
              const zone = zoneOf(row);
              const first = i === 0 || zoneOf(rows[i - 1]) !== zone;
              return (
                <div key={i} className={`map-slot ${first ? "is-zone-start" : ""}`}>
                  <span className="map-zone">{first ? MAP_LABEL[zone] : ""}</span>
                  <div className="map-stack">
                    {row.map((r) => {
                      const lane = lanes(row).get(r.tabNumber) ?? 0;
                      const call = locked ? "" : r.prime ? "is-prime" : r.signal === "back" ? "is-back" : r.signal === "lay" ? "is-lay" : "";
                      // Not a grid: the one with more early speed in the pair edges forward, and a
                      // runner we have little on (a thin rating) sits a touch back, dashed, since where
                      // it settles is a guess.
                      const front = Math.min(...row.map((x) => x.ratings.ppir));
                      const span = Math.max(1, Math.max(...row.map((x) => x.ratings.ppir)) - front);
                      const unsure = r.ratings.trust < 0.6;
                      const shift = Math.round(((span - (r.ratings.ppir - front)) / span) * 22) - (unsure ? 10 : 0) - (row.length > 1 && r === row[row.length - 1] ? 4 : 0);
                      return (
                        <div
                          key={r.tabNumber}
                          className={`map-chip tip ${call} ${unsure ? "is-unsure" : ""}`}
                          style={{ bottom: `calc(${lane} * (36px + 6px))`, transform: `translateX(${shift}%)` }}
                          data-tip={`${r.horseName}, barrier ${r.barrier}. Settles ${MAP_LABEL[r.ratings.map].toLowerCase()}${unsure ? ", on little form so it could be anywhere" : ""}${locked ? "" : `, rated ${price(r.ratedPrice)} against ${price(r.marketPrice)}`}.`}
                        >
                          <span className="map-cloth">{r.tabNumber}</span>
                          <span className="map-text">
                            <span className="map-name">{r.horseName}</span>
                            <span className="map-price nums">{price(r.marketPrice)}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rail">
          <span className="rail-label">Rail{rail ? ` ${rail}` : ""}</span>
          <span className="rail-arrow">running this way →</span>
        </div>
      </div>
    </Section>
  );
}
