import { DayStrip } from "@/components/PlanPicker";
import type { Plan } from "@/lib/billing/plans";

/**
 * A plan as a card in the pricing page's shape: name, the days it opens, the
 * price, a line, a button. The cancel page and the account's plan tab use it.
 */
export function PlanCard({ plan, tag, highlight, strip = true, children }: { plan: Plan; tag?: string; highlight?: boolean; strip?: boolean; children: React.ReactNode }) {
  return (
    <article className={`relative flex h-full flex-col gap-4 rounded-[var(--radius-lg)] border bg-panel p-5 shadow-card ${highlight ? "border-ink border-2 mt-2 md:mt-0" : "border-line"}`}>
      {tag && <span className="absolute -top-3 left-5 rounded-full bg-lime px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink">{tag}</span>}
      <div>
        <h2 className="font-display text-xl font-extrabold tracking-tight">{plan.name}</h2>
        <p className="text-sm text-ink-soft">{plan.blurb}</p>
      </div>
      {strip && <DayStrip days={plan.days} />}
      {children}
    </article>
  );
}

export function PlanPrice({ was, n, per }: { was?: string; n: string; per: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      {was && <span className="font-display text-xl font-bold text-ink-soft line-through decoration-2 tabular-nums">{was}</span>}
      <span className="font-display text-4xl font-extrabold tracking-tight tabular-nums">{n}</span>
      <span className="text-sm text-ink-soft">{per}</span>
    </div>
  );
}

export function PlanLine({ children }: { children: React.ReactNode }) {
  return <p className="-mt-2 text-sm text-ink-secondary tabular-nums">{children}</p>;
}

