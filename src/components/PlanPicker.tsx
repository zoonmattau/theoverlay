"use client";

import Link from "next/link";
import { useState } from "react";

import { CheckoutButton } from "@/components/CheckoutButton";

/**
 * The three plans and the three ways to pay for them, on one switch. Monthly
 * is where it starts: behind a Yearly tab that opened first, most sign-ups
 * took yearly without seeing monthly was there (4 Oct 2026). Each card leads
 * with the bill as it will be charged, says what that works out to, and lights
 * the days of the week the plan opens, which is the whole difference between
 * the three.
 */
export interface PickerPlan {
  id: string;
  name: string;
  blurb: string;
  features: string[];
  /** Days of the week it opens, 0 = Sunday; empty is every day. */
  days: number[];
  highlight?: boolean;
  /** Whole AUD per bill on each term, where the term is on sale. */
  prices: { month: number; quarter?: number; year?: number; week?: number };
}

type TermId = "month" | "quarter" | "year" | "week";

const TERMS: { id: TermId; label: string; short: string; months: number; per: string; billed: string; noTrial?: boolean }[] = [
  // No free trial: paid from today, for anyone who wants in without one (5 Oct 2026). Shortest first, left of Monthly.
  { id: "week", label: "Weekly", short: "Weekly", months: 12 / 52, per: "/week", billed: "billed weekly", noTrial: true },
  { id: "month", label: "Monthly", short: "Monthly", months: 1, per: "/month", billed: "billed monthly" },
  { id: "quarter", label: "Every 3 months", short: "3 months", months: 3, per: "/3 months", billed: "billed every 3 months" },
  { id: "year", label: "Yearly", short: "Yearly", months: 12, per: "/year", billed: "billed yearly" },
];

/**
 * On a phone the cards run the other way, the full board first: Every day,
 * Saturday + Wednesday, Saturday. A computer shows them in plan order,
 * Saturday to Every day, left to right (the user, 4 Oct 2026).
 */
const PHONE_ORDER = ["order-1 md:order-none", "order-2 md:order-none", "order-3 md:order-none"];

/** Monday first, the way a punter reads a week; the index is the JS day. */
const WEEK = [
  { d: 1, l: "M" },
  { d: 2, l: "T" },
  { d: 3, l: "W" },
  { d: 4, l: "T" },
  { d: 5, l: "F" },
  { d: 6, l: "S" },
  { d: 0, l: "S" },
];

/** The days of the week a plan opens, lit lime; empty days is every day. Shared with the cancel page. */
export function DayStrip({ days }: { days: number[] }) {
  return (
    <div className="flex gap-1" aria-label={days.length ? `Opens ${days.length === 1 ? "Saturdays" : "Wednesdays and Saturdays"}` : "Opens every day"}>
      {WEEK.map((w, i) => {
        const lit = days.length === 0 || days.includes(w.d);
        return (
          <span key={i} aria-hidden className={`flex h-7 flex-1 items-center justify-center rounded-md text-xs font-bold ${lit ? "bg-lime text-ink" : "bg-surface-alt text-ink-soft"}`}>
            {w.l}
          </span>
        );
      })}
    </div>
  );
}

export function PlanPicker({ plans, signedIn, pro, currentPlan, trialDays, savings }: { plans: PickerPlan[]; signedIn: boolean; pro: boolean; currentPlan?: string; trialDays: number; savings: Partial<Record<TermId, number>> }) {
  const [term, setTerm] = useState<TermId>("month");
  const t = TERMS.find((x) => x.id === term)!;
  // The term's own discount (10%, 20%): read off a card, rounding the $19 plan's bill made 10% look like 11%.
  const saving = (id: TermId) => savings[id] ?? 0;

  return (
    <div>
      <div className="flex flex-col items-center gap-2 mb-5">
        <div className="text-xs uppercase tracking-[0.1em] font-bold text-ink-soft">How do you want to pay?</div>
        <div role="radiogroup" aria-label="Billing" className="inline-flex w-full max-w-md rounded-full border border-line bg-panel p-1 shadow-card">
          {TERMS.filter((x) => plans.some((p) => p.prices[x.id] !== undefined)).map((x) => {
            const on = x.id === term;
            const off = saving(x.id);
            return (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTerm(x.id)}
                className={`flex-1 rounded-full px-2 py-2 text-sm font-semibold leading-tight transition-colors ${on ? "bg-ink text-white" : "text-ink-secondary hover:text-ink"}`}
              >
                <span className="hidden sm:inline">{x.label}</span>
                <span className="sm:hidden">{x.short}</span>
                {off > 0 && <span className={`block text-[11px] font-bold ${on ? "text-lime" : "text-accent"}`}>Save {off}%</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-stretch">
        {plans.map((p, i) => {
          const bill = p.prices[term];
          const saved = bill !== undefined && term !== "month" ? p.prices.month * t.months - bill : 0;
          const yours = pro && currentPlan === p.id;
          return (
            <article
              key={p.id}
              className={`relative flex flex-col gap-4 rounded-[var(--radius-lg)] border bg-panel p-5 shadow-card ${PHONE_ORDER[plans.length - 1 - i] ?? ""} ${p.highlight ? "border-ink border-2 mt-2 md:mt-0" : "border-line"}`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-5 rounded-full bg-lime px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink">Most popular</span>
              )}
              <div>
                <h3 className="font-display text-xl font-extrabold tracking-tight">{p.name}</h3>
                <p className="text-sm text-ink-soft">{p.blurb}</p>
              </div>

              {/* The days it opens, lit: the whole difference between the three plans. */}
              <DayStrip days={p.days} />

              <div>
                {bill !== undefined ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-extrabold tracking-tight tabular-nums">${bill}</span>
                      <span className="text-sm text-ink-soft">{t.per}</span>
                    </div>
                    <div className="mt-0.5 text-sm text-ink-secondary tabular-nums">
                      {/* The bill spread over the weeks it covers, to the cent, then what the term saves. */}
                      {t.id === "week" ? "Week to week. Cancel any time." : <>${(bill / ((t.months * 52) / 12)).toFixed(2)} a week</>}
                      {saved > 0 && <>, <span className="font-semibold text-accent">save ${saved}</span></>}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-ink-soft">Monthly only.</div>
                )}
              </div>

              <ul className="space-y-1.5 text-sm text-ink-secondary flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-accent font-bold" aria-hidden>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {yours ? (
                <Link href="/account" className="btn btn-secondary w-full">Your plan</Link>
              ) : bill !== undefined ? (
                <div>
                  <CheckoutButton
                    plan={p.id}
                    term={term}
                    signedIn={signedIn}
                    label={pro ? "Switch to this plan" : t.noTrial ? `Start for $${bill}` : `Try free for ${trialDays} days`}
                    className={`btn w-full ${p.highlight ? "btn-primary" : "btn-secondary"}`}
                  />
                  {!pro && (
                    <p className="mt-2 text-center text-xs text-ink-soft tabular-nums">
                      {t.noTrial ? <>${bill} today, then {t.billed}.</> : <>Nothing today. Then ${bill} {t.billed}.</>}
                    </p>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
