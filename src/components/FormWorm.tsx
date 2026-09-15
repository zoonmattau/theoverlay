import type { PublishedRace, PublishedRunner } from "@/lib/model/types";

const W = 640, H = 170, PAD = { t: 10, r: 14, b: 22, l: 34 };

/**
 * The race as a worm: every runner's last runs as a line of points, most
 * recent on the right, this runner drawn heavy over the field in grey, with
 * today's par as a dashed line so a run above it reads as above class.
 */
export function FormWorm({ race, runner }: { race: PublishedRace; runner: PublishedRunner }) {
  const field = race.runners.filter((x) => !x.scratched && (x.runs?.length ?? 0) > 0);
  const n = Math.max(2, ...field.map((x) => x.runs?.length ?? 0));
  const pts = field.flatMap((x) => (x.runs ?? []).map((r) => r.points));
  if (pts.length === 0) return null;
  const par = race.classPoints;
  const lo = Math.floor(Math.min(par - 6, ...pts) / 5) * 5;
  const hi = Math.ceil(Math.max(par + 6, ...pts) / 5) * 5;
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  // Slot i from the right: the last run sits in the rightmost slot.
  const x = (back: number) => PAD.l + plotW - (back * plotW) / (n - 1);
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * plotH;
  const path = (runs: { points: number }[]) =>
    runs.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r.points).toFixed(1)}`).join(" ");
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 5) ticks.push(v);
  const mine = runner.runs ?? [];

  return (
    <figure className="worm">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${runner.horseName} against the field, run by run`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="worm-grid" />
            <text x={PAD.l - 6} y={y(v) + 3} className="worm-tick" textAnchor="end">{v}</text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(par)} y2={y(par)} className="worm-par" />
        <text x={W - PAD.r} y={y(par) - 4} className="worm-tick" textAnchor="end">par {par}</text>
        {field.filter((f) => f.tabNumber !== runner.tabNumber).map((f) => (
          <path key={f.tabNumber} d={path(f.runs ?? [])} className="worm-other">
            <title>{f.horseName}</title>
          </path>
        ))}
        {mine.length > 0 && <path d={path(mine)} className={`worm-mine ${runner.prime ? "is-prime" : runner.signal === "back" ? "is-back" : runner.signal === "lay" ? "is-lay" : ""}`} />}
        {mine.map((r, i) => (
          <circle key={`${r.date}-${i}`} cx={x(i)} cy={y(r.points)} r={4} className={`worm-dot ${runner.prime ? "is-prime" : runner.signal === "back" ? "is-back" : runner.signal === "lay" ? "is-lay" : ""}`}>
            <title>{`${r.date} ${r.track ?? ""} ${r.distance}m, ${r.finish ? `${r.finish}${r.runners ? `/${r.runners}` : ""}` : "unplaced"}, ${r.points.toFixed(1)} points`}</title>
          </circle>
        ))}
        {Array.from({ length: n }, (_, back) => (
          <text key={back} x={x(back)} y={H - 6} className="worm-tick" textAnchor="middle">{back === 0 ? "last" : `${back + 1} back`}</text>
        ))}
      </svg>
      <figcaption className="worm-caption">
        <span className="worm-key worm-key-mine" /> {runner.horseName}
        <span className="worm-key worm-key-other ml-3" /> the field
        <span className="worm-key worm-key-par ml-3" /> today&apos;s par
      </figcaption>
    </figure>
  );
}
