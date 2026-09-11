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
export function RankChip({ rank }: { rank: number }) {
  const top = rank === 1;
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-sm text-[11px] font-semibold nums ${
        top
          ? "bg-lime text-ink"
          : "bg-surface text-ink-secondary border border-line"
      }`}
    >
      {rank}
    </span>
  );
}
