import "server-only";

import { PASS_BUNDLES, PLANS, TERMS, termPrice, termPriceId, type TermId } from "./plans";
import { stripe, stripeConfigured } from "./stripe";

export interface PriceCell {
  /** Whole dollars Stripe charges, or undefined when there is no Price set up. */
  dollars?: number;
  /** What the code says it costs. */
  expected: number;
  active: boolean;
}

export interface PriceBook {
  plans: { id: string; name: string; days: string; terms: Record<TermId, PriceCell> }[];
  passes: { qty: number; cell: PriceCell }[];
}

/**
 * What each plan and pass actually costs, read from Stripe, beside what the
 * code expects, so a Price changed in the dashboard shows up in the admin.
 */
export async function priceBook(): Promise<PriceBook> {
  const live = new Map<string, { dollars: number; active: boolean }>();
  if (stripeConfigured()) {
    for await (const p of stripe().prices.list({ limit: 100 })) live.set(p.id, { dollars: (p.unit_amount ?? 0) / 100, active: p.active });
  }
  const cell = (id: string | undefined, expected: number): PriceCell => {
    const p = id ? live.get(id) : undefined;
    return { dollars: p?.dollars, expected, active: Boolean(p?.active) };
  };
  return {
    plans: PLANS.map((plan) => ({
      id: plan.id,
      name: plan.name,
      days: plan.days.length ? plan.days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ") : "Every day",
      terms: Object.fromEntries(TERMS.map((t) => [t.id, cell(termPriceId(plan, t), termPrice(plan, t))])) as Record<TermId, PriceCell>,
    })),
    passes: PASS_BUNDLES.map((b) => ({ qty: b.qty, cell: cell(b.priceId, b.price) })),
  };
}
