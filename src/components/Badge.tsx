import type { ReactNode } from "react";

const TONES = {
  accent: "badge-accent",
  muted: "badge-muted",
  ok: "badge-ok",
  warn: "badge-warn",
  prime: "badge-prime",
  back: "badge-back",
  lay: "badge-lay",
} as const;

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>;
}

/** Rank chip for our top four. Lime for the top pick, quiet down the order. */
/**
 * The chip beside a runner's name: B for a bet, L for a lay, P for a Prime
 * Overlay, and only otherwise its place in our top four.
 */
export function TipChip({ r }: { r: { rank: number | null; signal?: "back" | "lay"; prime?: boolean } }) {
  if (r.prime) return <span className="tip-chip is-prime" title="Prime Overlay">P</span>;
  if (r.signal === "back") return <span className="tip-chip is-back" title="Bet">B</span>;
  if (r.signal === "lay") return <span className="tip-chip is-lay" title="Lay">L</span>;
  if (r.rank) return <RankChip rank={r.rank} />;
  return <span className="w-5 shrink-0" />;
}

export function RankChip({ rank }: { rank: number }) {
  const top = rank === 1;
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-sm text-[11px] font-semibold nums ${
        top ? "bg-bar text-white" : "bg-surface text-ink-secondary border border-line"
      }`}
    >
      {rank}
    </span>
  );
}
