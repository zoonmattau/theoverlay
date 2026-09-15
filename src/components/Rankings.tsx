"use client";

import { useState } from "react";

import { TipChip } from "./Badge";
import { RatingsTable } from "./RatingsTable";
import { Section } from "./Section";
import { price } from "@/lib/format";
import type { PublishedRace, PublishedRunner, RunnerRatings } from "@/lib/model/types";

type Metric = {
  key: string;
  label: string;
  help: string;
  pick: (r: RunnerRatings, race: PublishedRace) => number;
};

export const METRICS: Metric[] = [
  { key: "today", label: "Today", help: "The rating we price off: class adjusted for today's going and the predicted tempo.", pick: (r) => r.today },
  { key: "class", label: "Class", help: "Peak recent ability in benchmark points, weighted to the latest runs.", pick: (r) => r.class },
  { key: "early", label: "Early", help: "Rating in the first section of the race, from sectional benchmarks.", pick: (r) => r.early },
  { key: "mid", label: "Mid", help: "Rating through the middle sections.", pick: (r) => r.mid },
  { key: "late", label: "Late", help: "Rating over the last 600m, the closing sectional.", pick: (r) => r.late },
  { key: "pressure", label: "Pressure", help: "Late rating in races run at a hot early tempo.", pick: (r) => r.pressure },
  { key: "tempo", label: "Tempo", help: "Rating off the tempo the map predicts for this race; an even race takes the middle of its fast and slow ratings.", pick: (r, race) => (race.pace.tempo === "slow" ? r.tempo.slow : race.pace.tempo === "fast" ? r.tempo.fast : (r.tempo.fast + r.tempo.slow) / 2) },
  { key: "going", label: "Going", help: "Rating on today's ground.", pick: (r, race) => r.going[race.going] },
  { key: "distance", label: "Distance", help: "Rating in runs within 200m of today's trip.", pick: (r) => r.distance },
  { key: "track", label: "Track", help: "Rating in runs at this track.", pick: (r) => r.track },
];

/**
 * Rankings: every runner as a bar on the chosen metric, the leader in ink.
 * The table tab shows all the numbers at once.
 */
export function Rankings({ race }: { race: PublishedRace }) {
  const [metric, setMetric] = useState<string>("today");
  const live = race.runners.filter((r) => !r.scratched);
  const m = METRICS.find((x) => x.key === metric);

  const rows = m
    ? [...live]
        .map((r) => ({ r, v: m.pick(r.ratings, race) }))
        .sort((a, b) => b.v - a.v)
    : [];
  const hi = rows[0]?.v ?? 1;
  const lo = rows[rows.length - 1]?.v ?? 0;
  const span = Math.max(1, hi - lo);

  return (
    <Section
      id="rankings"
      letter="R"
      title="Rankings"
      controls={
        <div className="metric-tabs" role="tablist">
          {METRICS.map((x) => (
            <button
              key={x.key}
              role="tab"
              aria-selected={metric === x.key}
              className="metric-tab tip"
              data-tip={x.help}
              onClick={() => setMetric(x.key)}
            >
              {x.label}
            </button>
          ))}
          <button
            role="tab"
            aria-selected={metric === "table"}
            className="metric-tab tip"
            data-tip="Every category for every runner in one table."
            onClick={() => setMetric("table")}
          >
            All
          </button>
        </div>
      }
      aside={
        <span
          className="nums hidden md:inline tip tip-right cursor-help"
          data-tip={`Par is the benchmark for a ${race.className ?? "race of this class"}: a horse rating ${race.classPoints} is a typical runner at this level, above it is better than the grade.`}
        >
          Par {race.classPoints}
        </span>
      }
    >
      {metric === "table" ? (
        <RatingsTable race={race} bare />
      ) : (
        <div className="section-body">
          {m && (
            <p className="mb-2 text-xs text-ink-soft">
              <span className="font-bold text-ink">{m.label}.</span> {m.help}
            </p>
          )}
          {rows.map(({ r, v }, i) => (
            <Bar key={r.tabNumber} r={r} value={v} width={30 + (70 * (v - lo)) / span} top={i === 0} />
          ))}
        </div>
      )}
    </Section>
  );
}

function Bar({
  r,
  value,
  width,
  top,
}: {
  r: PublishedRunner;
  value: number;
  width: number;
  top: boolean;
}) {
  return (
    <div className="bar-row">
      <div className="bar-name">
        <TipChip r={r} />
        <span className="truncate">
          {r.tabNumber}. {r.horseName}
        </span>
      </div>
      <div className="bar-track">
        <div
          className={`bar-fill ${top ? "is-top" : ""}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="bar-value nums">{value.toFixed(1)}</div>
      <div className={`bar-price nums ${r.prime ? "text-accent font-bold" : r.signal === "back" ? "text-blue font-bold" : r.signal === "lay" ? "text-red font-bold" : "text-ink-soft"}`}>
        {price(r.marketPrice)}
      </div>
    </div>
  );
}
