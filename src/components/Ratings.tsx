import type { MapPosition, RunnerRatings, Signal, Tempo } from "@/lib/model/types";

export const MAP_LABEL: Record<MapPosition, string> = {
  leader: "Leader",
  "on pace": "On pace",
  midfield: "Midfield",
  back: "Back",
};

export const TEMPO_LABEL: Record<Tempo, string> = {
  fast: "Fast",
  even: "Even",
  slow: "Slow",
};

/** Back or lay alert. Renders nothing when there is no signal. */
export function SignalBadge({ signal }: { signal?: Signal }) {
  if (!signal) return null;
  return (
    <span className={`badge ${signal === "back" ? "badge-back" : "badge-lay"}`}>
      {signal === "back" ? "bet" : "lay"}
    </span>
  );
}

/**
 * A rating in benchmark points. Above par for the race class reads in the
 * darker green, below par reads dim, so a column scans at a glance.
 */
export function Points({
  value,
  par,
  strong,
}: {
  value: number;
  par: number;
  strong?: boolean;
}) {
  const gap = value - par;
  const tone = gap >= 3 ? "text-accent" : gap <= -3 ? "text-muted" : "text-ink-secondary";
  return (
    <span className={`nums ${strong ? "font-semibold" : ""} ${tone}`}>
      {value.toFixed(1)}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value nums ${tone}`}>{value}</div>
    </div>
  );
}

/**
 * The full category set for one runner. Today is the headline, the number
 * everything else tallies to and the one we price off; the rest are the
 * inputs it was built from.
 */
export function RatingTiles({ r, par }: { r: RunnerRatings; par: number }) {
  const P = (v: number) => <Points value={v} par={par} strong />;
  const gap = r.today - par;
  return (
    <div className="grid gap-2 md:grid-cols-[180px_1fr]">
      <div className="today-tile">
        <div className="today-label">Today&apos;s rating</div>
        <div className="today-value nums">{r.today.toFixed(1)}</div>
        <div className="today-sub nums">
          {gap >= 0 ? "+" : ""}
          {gap.toFixed(1)} v par {par}
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Stat label="Class" value={P(r.class)} />
        <Stat label="Early" value={P(r.early)} />
        <Stat label="Mid" value={P(r.mid)} />
        <Stat label="Late" value={P(r.late)} />
        <Stat label="Pressure" value={P(r.pressure)} />
        <Stat label="Fast tempo" value={P(r.tempo.fast)} />
        <Stat label="Slow tempo" value={P(r.tempo.slow)} />
        <Stat label="Good" value={P(r.going.good)} />
        <Stat label="Soft" value={P(r.going.soft)} />
        <Stat label="Heavy" value={P(r.going.heavy)} />
        <Stat label="Distance" value={P(r.distance)} />
        <Stat label="Track" value={P(r.track)} />
        <Stat label="Map" value={<span className="text-sm">{MAP_LABEL[r.map]}</span>} />
      </div>
    </div>
  );
}
