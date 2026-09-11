import { FACTOR_LABEL, type Factor, type RunnerRatings } from "@/lib/model/types";

/** How Today was built from Class: one chip per adjustment, signed. */
export function Factors({ r, compact }: { r: RunnerRatings; compact?: boolean }) {
  const entries = (Object.entries(r.factors) as [Factor, number][]).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
  );
  if (entries.length === 0) {
    return <span className="text-xs text-ink-soft">Today matches class.</span>;
  }
  return (
    <div className={`flex flex-wrap gap-1 ${compact ? "" : "mt-1"}`}>
      <span className="factor is-base nums">Class {r.class.toFixed(1)}</span>
      {entries.map(([k, v]) => (
        <span key={k} className={`factor nums ${v > 0 ? "is-up" : "is-down"}`}>
          {v > 0 ? "+" : ""}
          {v.toFixed(1)} {FACTOR_LABEL[k]}
        </span>
      ))}
      <span className="factor is-total nums">Today {r.today.toFixed(1)}</span>
    </div>
  );
}
