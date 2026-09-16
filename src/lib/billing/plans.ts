/**
 * The plans on the pricing page. All monthly subscriptions with a 7-day free
 * trial; what differs is which days of the week the plan opens. Display
 * prices are here, Stripe holds the real ones behind STRIPE_PRICE_* env vars,
 * one Stripe Product per plan.
 */

export type PlanId = "saturday" | "midweek" | "everyday";

export interface Plan {
  id: PlanId;
  name: string;
  /** AUD per month, excluding GST. */
  price: number;
  blurb: string;
  features: string[];
  /** Days of the week the plan covers, 0 = Sunday. Empty means every day. */
  days: number[];
  /** Stripe Price id from the environment. */
  priceId?: string;
  highlight?: boolean;
}

export const TRIAL_DAYS = 7;

export const PLANS: Plan[] = [
  {
    id: "saturday",
    name: "Saturday",
    price: 19,
    blurb: "The big day, every week.",
    features: ["Every Saturday meeting we cover", "Top four, ratings and rated prices in every race", "Bet and lay calls", "7-day free trial"],
    days: [6],
    priceId: process.env.STRIPE_PRICE_SATURDAY,
  },
  {
    id: "midweek",
    name: "Saturday + Wednesday",
    price: 29,
    blurb: "The two metro days.",
    features: ["Everything in Saturday", "Wednesday metro meetings too", "Bet and lay calls", "7-day free trial"],
    days: [3, 6],
    priceId: process.env.STRIPE_PRICE_MIDWEEK,
    highlight: true,
  },
  {
    id: "everyday",
    name: "Every day",
    price: 49,
    blurb: "The full board, seven days a week.",
    features: ["Every meeting we cover, every day", "Carnivals and public holidays included", "Bet and lay calls", "7-day free trial"],
    days: [],
    priceId: process.env.STRIPE_PRICE_EVERYDAY,
  },
];

export const planById = (id: string | undefined) => PLANS.find((p) => p.id === id);

/** The monthly price said by the week, the way a punter counts: $49 a month is $11.30 a week. */
export const weekly = (monthly: number) => Math.round(((monthly * 12) / 52) * 10) / 10;
/** "$11.30" or "$4.40", never "$11.3". */
export const weeklyLabel = (monthly: number) => `$${weekly(monthly).toFixed(2).replace(/0$/, "0")}`;

/** Does this plan open the card for a given racing date (yyyy-mm-dd)? */
export function planCovers(planId: string | undefined, date: string): boolean {
  if (planId === "open") return true;
  const plan = planById(planId);
  if (!plan) return false;
  if (plan.days.length === 0) return true;
  const day = new Date(`${date}T12:00:00+10:00`).getUTCDay();
  // Noon Sydney is the same calendar day in UTC for every AU offset.
  return plan.days.includes(day);
}

/** The cheapest plan that covers a date, for the upgrade nudge. */
export function planFor(date: string): Plan | undefined {
  return PLANS.find((p) => planCovers(p.id, date));
}

/**
 * Day pass bundles. One one-off Stripe Price per bundle on the Day Pass
 * product (STRIPE_PRICE_PASS_1, _3, _5, _10).
 */
export interface PassBundle {
  qty: number;
  /** AUD total, excluding GST. */
  price: number;
  priceId?: string;
}

export const PASS_PRICE = 10;
export const PASS_BUNDLES: PassBundle[] = [
  { qty: 1, price: 10, priceId: process.env.STRIPE_PRICE_PASS_1 },
  { qty: 3, price: 27, priceId: process.env.STRIPE_PRICE_PASS_3 },
  { qty: 5, price: 40, priceId: process.env.STRIPE_PRICE_PASS_5 },
  { qty: 10, price: 70, priceId: process.env.STRIPE_PRICE_PASS_10 },
];
export const passBundle = (qty: number) => PASS_BUNDLES.find((b) => b.qty === qty);
