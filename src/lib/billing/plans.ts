/**
 * The plans on the pricing page. Subscriptions paid from the day they start;
 * what differs is which days of the week the plan opens. Display
 * prices are here, Stripe holds the real ones behind STRIPE_PRICE_* env vars,
 * one Stripe Product per plan.
 */

export type PlanId = "saturday" | "midweek" | "everyday";

export interface Plan {
  id: PlanId;
  name: string;
  /** AUD per month. No GST is charged while the business is not registered (30 Sep 2026). Set by the user 12 Oct 2026. */
  price: number;
  /** AUD per week on the weekly term, no trial: the full price every other term is a saving on. */
  weekPrice: number;
  /** AUD per bill paying three months or a year up front, each set by hand. */
  quarterPrice: number;
  yearPrice: number;
  blurb: string;
  features: string[];
  /** Days of the week the plan covers, 0 = Sunday. Empty means every day. */
  days: number[];
  /** Stripe Price id from the environment. */
  priceId?: string;
  /** Stripe Price ids for paying weekly, or quarterly or yearly up front. */
  termPriceIds: Partial<Record<Exclude<TermId, "month">, string>>;
  highlight?: boolean;
}

/**
 * The free trial every plan started with until 13 Oct 2026. Now only for an
 * account the sign-up chase promised a longer one before then.
 */
export const TRIAL_DAYS = 7;

/**
 * Paid from today, and the first bill runs this many days longer: a month is
 * five weeks, a quarter or a year a week more. Weekly gets none. An empty card
 * fails at checkout instead of a week in (the user, 13 Oct 2026).
 */
export const EXTRA_DAYS = 7;

export const PLANS: Plan[] = [
  {
    id: "saturday",
    name: "Saturday",
    price: 29,
    weekPrice: 10,
    quarterPrice: 79,
    yearPrice: 259,
    blurb: "The big day, every week.",
    features: ["Every Saturday meeting we cover", "Top four, ratings and rated prices in every race", "Bet and lay calls"],
    days: [6],
    priceId: process.env.STRIPE_PRICE_SATURDAY,
    termPriceIds: { week: process.env.STRIPE_PRICE_SATURDAY_WEEK, quarter: process.env.STRIPE_PRICE_SATURDAY_QUARTER, year: process.env.STRIPE_PRICE_SATURDAY_YEAR },
  },
  {
    id: "midweek",
    name: "Saturday + Wednesday",
    price: 45,
    weekPrice: 15,
    quarterPrice: 119,
    yearPrice: 389,
    blurb: "The two metro days.",
    features: ["Everything in Saturday", "Wednesday metro meetings too", "Bet and lay calls"],
    days: [3, 6],
    priceId: process.env.STRIPE_PRICE_MIDWEEK,
    termPriceIds: { week: process.env.STRIPE_PRICE_MIDWEEK_WEEK, quarter: process.env.STRIPE_PRICE_MIDWEEK_QUARTER, year: process.env.STRIPE_PRICE_MIDWEEK_YEAR },
  },
  {
    id: "everyday",
    // The plan most people take (33 of 37 plan checkouts by 4 Oct 2026); the badge has to be true.
    highlight: true,
    name: "Every day",
    price: 69,
    weekPrice: 25,
    quarterPrice: 199,
    yearPrice: 649,
    blurb: "The full board, seven days a week.",
    features: ["Every meeting we cover, every day", "Carnivals and public holidays included", "Bet and lay calls"],
    days: [],
    priceId: process.env.STRIPE_PRICE_EVERYDAY,
    termPriceIds: { week: process.env.STRIPE_PRICE_EVERYDAY_WEEK, quarter: process.env.STRIPE_PRICE_EVERYDAY_QUARTER, year: process.env.STRIPE_PRICE_EVERYDAY_YEAR },
  },
];

export const planById = (id: string | undefined) => PLANS.find((p) => p.id === id);

/**
 * How often a plan is billed. Weekly is the full price; monthly, quarterly and
 * yearly are each cheaper by the week. Same plan, same days; the term only
 * changes the Stripe Price, and it rides on the subscription's metadata.
 */
export type TermId = "week" | "month" | "quarter" | "year";

export interface Term {
  id: TermId;
  name: string;
  months: number;
  /** "a month", "a quarter", "a year". */
  every: string;
  /** No extra week on the first bill (EXTRA_DAYS): weekly is week to week. */
  noExtra?: boolean;
}

export const TERMS: Term[] = [
  { id: "week", name: "Weekly", months: 12 / 52, every: "a week", noExtra: true },
  { id: "month", name: "Monthly", months: 1, every: "a month" },
  { id: "quarter", name: "Quarterly", months: 3, every: "a quarter" },
  { id: "year", name: "Yearly", months: 12, every: "a year" },
];

// Monthly when no term is given, whatever order the list is in (Weekly sits first, 5 Oct 2026).
export const termById = (id: string | undefined): Term => TERMS.find((t) => t.id === id) ?? TERMS.find((t) => t.id === "month")!;

/** What a plan costs per bill on a term, whole AUD, matching the Stripe Price. */
export const termPrice = (plan: Plan, term: Term) =>
  ({ week: plan.weekPrice, month: plan.price, quarter: plan.quarterPrice, year: plan.yearPrice })[term.id];

/** What the term switch says each term saves on weekly (the user, 12 Oct 2026): every plan saves at least this. */
export const TERM_SAVES: Partial<Record<TermId, number>> = { month: 30, quarter: 40, year: 50 };

/** What a term saves on paying weekly, by the week, to the nearest 5%: Every day monthly is 35%. 0 for weekly. */
export const termSave = (plan: Plan, term: Term) =>
  term.id === "week" ? 0 : Math.round((1 - termPrice(plan, term) / ((term.months * 52) / 12) / plan.weekPrice) * 20) * 5;

/** The Stripe Price for a plan on a term. */
export const termPriceId = (plan: Plan, term: Term) => (term.id === "month" ? plan.priceId : plan.termPriceIds[term.id]);

/** What a plan works out to a month on a term, for the weekly figure. */
export const termMonthly = (plan: Plan, term: Term) => termPrice(plan, term) / term.months;

/** The monthly price said by the week, the way a punter counts: $69 a month is $15.90 a week. */
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
  /** AUD total. */
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

/** How often the subscription bills, from its price: month, quarter or year. */
export function billingTerm(recurring?: { interval: string; interval_count: number } | null): TermId | null {
  if (!recurring) return null;
  if (recurring.interval === "year") return "year";
  if (recurring.interval === "week") return "week";
  if (recurring.interval === "month") return recurring.interval_count === 3 ? "quarter" : recurring.interval_count === 12 ? "year" : "month";
  return null;
}
