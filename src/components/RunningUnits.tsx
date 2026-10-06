/**
 * A record as one running line: units after each settled call, oldest on the
 * left, with the zero line dashed. Lime under the line when it ends in front,
 * red when behind, so the shape of a record reads before any number does.
 */
export function RunningUnits({ calls, height = 120 }: { calls: { date: string; units: number }[]; height?: number }) {
  const W = 600, H = height, PAD = 6;
  if (calls.length < 2) return <div className="flex items-center justify-center text-xs text-ink-soft" style={{ height }}>The line starts after two settled calls.</div>;
  const pts = calls.reduce<number[]>((acc, c) => [...acc, Math.round((acc[acc.length - 1] + c.units) * 100) / 100], [0]);
  const run = pts[pts.length - 1];
  const max = Math.max(0, ...pts), min = Math.min(0, ...pts);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + ((max - v) / span) * (H - PAD * 2);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = run >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full block" style={{ height }} role="img" aria-label={`Running units over ${calls.length} calls, ending ${run > 0 ? "+" : ""}${run.toFixed(1)}u`}>
      <path d={`${line} L${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`} className={up ? "fill-lime/30" : "fill-red/15"} />
      <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="stroke-line" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <path d={line} fill="none" className={up ? "stroke-ink" : "stroke-red"} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The same line, small, for a row in a list. */
export function UnitsSpark({ calls }: { calls: { units: number }[] }) {
  if (calls.length < 2) return <span className="inline-block w-20 h-6" />;
  const pts = calls.reduce<number[]>((acc, c) => [...acc, acc[acc.length - 1] + c.units], [0]);
  const run = pts[pts.length - 1];
  const max = Math.max(0, ...pts), min = Math.min(0, ...pts), span = max - min || 1;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * 78 + 1).toFixed(1)},${(((max - v) / span) * 20 + 2).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 80 24" className="inline-block w-20 h-6 align-middle" aria-hidden>
      <line x1={1} x2={79} y1={((max - 0) / span) * 20 + 2} y2={((max - 0) / span) * 20 + 2} className="stroke-line" strokeWidth={1} strokeDasharray="2 2" />
      <path d={d} fill="none" className={run >= 0 ? "stroke-accent" : "stroke-red"} strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  );
}
