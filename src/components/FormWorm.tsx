import type { PublishedRace, PublishedRunner } from "@/lib/model/types";

const W = 640, H = 170, PAD = { t: 10, r: 14, b: 22, l: 34 };

/**
 * The race as a worm: every runner's last runs as a line of points, most
 * recent on the right, then today's rating as the projected run in the last
 * slot. This runner is drawn heavy over the field in grey, with today's par
 * as a dashed line so a run above it reads as above class.
 */
export function FormWorm({ race, runner }: { race: PublishedRace; runner: PublishedRunner }) {
  const field = race.runners.filter((x) => !x.scratched && (x.runs?.length ?? 0) > 0);
  // One slot per past run, plus one on the right for today.
  const n = Math.max(2, ...field.map((x) => (x.runs?.length ?? 0) + 1));
  const pts = field.flatMap((x) => [...(x.runs ?? []).map((r) => r.points), x.ratings.today]);
  if (pts.length === 0) return null;
  const par = race.classPoints;
  const lo = Math.floor(Math.min(par - 6, ...pts) / 5) * 5;
  const hi = Math.ceil(Math.max(par + 6, ...pts) / 5) * 5;
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  // Slot i from the right: today sits in the rightmost slot, the last run next to it.
  const x = (back: number) => PAD.l + plotW - (back * plotW) / (n - 1);
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * plotH;
  const series = (f: PublishedRunner) => [f.ratings.today, ...(f.runs ?? []).map((r) => r.points)];
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 5) ticks.push(v);
  const mine = runner.runs ?? [];
  const tone = runner.prime ? "is-prime" : runner.signal === "back" ? "is-back" : runner.signal === "lay" ? "is-lay" : "";

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
        <line x1={x(0.5)} x2={x(0.5)} y1={PAD.t} y2={H - PAD.b} className="worm-today" />
        {field.filter((f) => f.tabNumber !== runner.tabNumber).map((f) => (
          <g key={f.tabNumber} className="worm-runner">
            <path d={path(series(f))} className="worm-other" />
            {(f.runs ?? []).map((r, i) => (
              <circle key={`${r.date}-${i}`} cx={x(i + 1)} cy={y(r.points)} r={3} className="worm-dot-other">
                <title>{`${f.tabNumber}. ${f.horseName}: ${r.date} ${r.track ?? ""} ${r.distance}m, ${r.finish ? `${r.finish}${r.runners ? `/${r.runners}` : ""}` : "unplaced"}, ${r.points.toFixed(1)} points`}</title>
              </circle>
            ))}
            <circle cx={x(0)} cy={y(f.ratings.today)} r={3.5} className="worm-dot-other">
              <title>{`${f.tabNumber}. ${f.horseName}: today rated ${f.ratings.today.toFixed(1)}`}</title>
            </circle>
          </g>
        ))}
        <path d={path(series(runner))} className={`worm-mine ${tone}`} />
        {mine.map((r, i) => (
          <circle key={`${r.date}-${i}`} cx={x(i + 1)} cy={y(r.points)} r={4} className={`worm-dot ${tone}`}>
            <title>{`${runner.tabNumber}. ${runner.horseName}: ${r.date} ${r.track ?? ""} ${r.distance}m, ${r.finish ? `${r.finish}${r.runners ? `/${r.runners}` : ""}` : "unplaced"}, ${r.points.toFixed(1)} points`}</title>
          </circle>
        ))}
        <circle cx={x(0)} cy={y(runner.ratings.today)} r={5.5} className={`worm-dot worm-dot-today ${tone}`}>
          <title>{`${runner.tabNumber}. ${runner.horseName}: today rated ${runner.ratings.today.toFixed(1)}`}</title>
        </circle>
        {Array.from({ length: n }, (_, back) => (
          <text key={back} x={x(back)} y={H - 6} className={`worm-tick ${back === 0 ? "worm-tick-today" : ""}`} textAnchor="middle">{back === 0 ? "today" : back === 1 ? "last" : `${back} back`}</text>
        ))}
      </svg>
      <figcaption className="worm-caption">
        <span className="worm-key worm-key-mine" /> {runner.horseName}
        <span className="worm-key worm-key-other ml-3" /> the field
        <span className="worm-key worm-key-par ml-3" /> today&apos;s par
        <span className="ml-3">the big dot is today&apos;s rating</span>
      </figcaption>
    </figure>
  );
}
