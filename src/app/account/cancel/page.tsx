import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DayStrip } from "@/components/PlanPicker";
import { getViewer } from "@/lib/auth";
import { PLANS, planById, termById, termPrice, type Plan } from "@/lib/billing/plans";
import { downgradesFor, monthlyFor, offerFor, type Downgrades, type MonthlySwitch, type Offer } from "@/lib/billing/retention";
import { stripeConfigured } from "@/lib/billing/stripe";
import { bigDaysAhead } from "@/lib/carnival";
import { longDate } from "@/lib/format";
import { cancelAnyway, keepAtHalfPrice, moveToPlan, payMonthlyToday } from "./actions";

export const metadata: Metadata = { title: "Before you go", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/account/cancel">) {
  return (
    <div className="page max-w-5xl">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Cancel searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type Data = [Offer | { reason: "no-subscription" | "already-offered" | "not-eligible" }, Downgrades | null, MonthlySwitch | null];

/**
 * The step before Stripe's cancellation, laid out like the pricing page: their
 * own plan with the one offer they can take (half the first month on monthly,
 * or the first month today on a longer term), the cheaper plans at monthly
 * prices beside it, and the way out underneath, saying what happens.
 */
async function Cancel({ searchParams }: { searchParams: PageProps<"/account/cancel">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  // The preview needs no account on the dev server, so the page can be shot without logging in.
  const sample = (viewer.admin || process.env.NODE_ENV === "development") && typeof sp.preview === "string" ? preview(sp.preview) : undefined;
  if (!viewer.id && !sample) redirect("/login?next=%2Faccount%2Fcancel");
  if (!sample && (!stripeConfigured() || !viewer.stripeCustomerId)) redirect("/account");
  const [offer, cheaper, monthly]: Data = sample ?? (await Promise.all([offerFor(viewer.id!), downgradesFor(viewer.id!), monthlyFor(viewer.id!)]));
  const ahead = bigDaysAhead(5);

  const half = "reason" in offer ? undefined : offer;
  if ("reason" in offer && offer.reason === "no-subscription" && !monthly) {
    return (
      <section className="py-16 text-center">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">No plan to cancel.</h1>
        <p className="mt-2 text-sm text-ink-secondary">There is no plan on this account.</p>
        <Link href="/account" className="btn btn-secondary mt-6">Back to your account</Link>
      </section>
    );
  }

  const failed = Boolean(monthly?.failedInvoice);
  const plan = planById(viewer.plan ?? undefined) ?? planById("everyday")!;
  const chargeOn = half?.chargeOn ?? monthly?.chargeOn;
  const when = chargeOn ? shortDate(chargeOn) : undefined;
  // A yearly or 3-month plan gets one way to stay, the month at $49: the cheaper plans only split it (the user, 5 Oct 2026).
  const options = monthly ? [] : (cheaper?.options ?? []);
  const cards = options.length + (half || monthly ? 1 : 0);

  // What it costs to stay, never when money comes out: the page sells the saving (the user, 5 Oct 2026).
  const heading = monthly ? `Keep the board for $${monthly.monthly}.` : "Stay for less.";
  const sub = monthly ? "The full board through the spring, a month at a time." : "Same board, smaller price. Pick what suits you.";

  return (
    <div className="pb-10">
      <section className="text-center max-w-3xl mx-auto pt-6 pb-6">
        <p className="text-xs uppercase tracking-[0.1em] font-bold text-ink-soft">Before you go</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.15]">{heading}</h1>
        <p className="mt-3 text-ink-secondary">{sub}</p>
        {ahead.length > 0 && (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.1em] font-bold text-ink-soft">Still to come this spring</p>
            <ul className="mt-2 flex flex-wrap justify-center gap-2">
              {ahead.map((d) => (
                <li key={d.date} className="w-[calc(50%-0.25rem)] rounded-[var(--radius-lg)] border border-line bg-panel px-3 py-2.5 shadow-card sm:w-36">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-accent">{dayLabel(d.date)}</div>
                  <div className="mt-0.5 text-sm font-semibold leading-snug">{d.races}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {sp.card === "declined" && (
        <p className="mx-auto mb-4 max-w-md rounded-[var(--radius-lg)] border border-red bg-panel p-3 text-center text-sm font-semibold text-red">
          Your card was declined, so nothing changed. Update it from your account and try again.
        </p>
      )}

      <div className={`grid grid-cols-1 gap-4 items-stretch ${cards === 3 ? "md:grid-cols-3" : cards === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "max-w-md mx-auto"}`}>
        {/* Their own plan with its offer, first on a phone and last on a computer, like the pricing page. */}
        {(half || monthly) && <div className="md:order-last">
          {half ? (
            <Card plan={plan} tag="Half price" highlight>
              <Price was={`$${half.full}`} n={`$${fmt(half.offered)}`} per="first month" />
              <Line>Half off your first month. Cancel any time.</Line>
              <form action={keepAtHalfPrice} className="mt-auto">
                <button type="submit" className="btn btn-primary w-full">Keep it at half price</button>
              </form>
            </Card>
          ) : monthly ? (
            <Card plan={plan} tag="5 weeks for the price of 4" highlight>
              <Price was={`$${monthly.termPrice}`} n={`$${monthly.monthly}`} per="for 5 weeks" />
              <Line>A week free, then month to month. Cancel any time.</Line>
              <form action={payMonthlyToday} className="mt-auto">
                <input type="hidden" name="back" value="/account/cancel" />
                <button type="submit" className="btn btn-primary w-full">Pay ${monthly.monthly}, get 5 weeks</button>
              </form>
            </Card>
          ) : null}
        </div>}

        {options.map(({ plan: p, price }) => (
          <Card key={p.id} plan={p}>
            <Price was={`$${termPrice(plan, cheaper!.term)}`} n={`$${price}`} per={cheaper!.term.id === "month" ? "/month" : `/${cheaper!.term.name.toLowerCase()}`} />
            <Line>
              <span className="font-semibold text-accent">Save ${termPrice(plan, cheaper!.term) - price} {cheaper!.term.id === "month" ? "a month" : cheaper!.term.id === "year" ? "a year" : "every 3 months"}.</span> {cheaper!.trialing ? "Your trial carries on." : ""}
            </Line>
            <form action={moveToPlan} className="mt-auto">
              <input type="hidden" name="plan" value={p.id} />
              <button type="submit" className="btn btn-secondary w-full">Switch to {p.name}</button>
            </form>
          </Card>
        ))}
      </div>

      <div className="mt-10 text-center">
        <p className="text-sm text-ink-secondary">
          {failed ? "Cancelling ends your access today." : when ? `Cancel and the board stays open until ${when}.` : "Cancel and the board stays open until the end of your plan."}
        </p>
        <form action={cancelAnyway} className="mt-2">
          <button type="submit" className="text-sm font-semibold text-ink-soft underline underline-offset-2 hover:text-ink">Cancel my plan</button>
        </form>
        <Link href="/account" className="mt-4 inline-block text-sm text-ink-soft hover:text-ink">← Back to your account</Link>
      </div>
    </div>
  );
}

/** A plan card in the pricing page's shape: name, the days it opens, the price, one line, one button. */
function Card({ plan, tag, highlight, children }: { plan: Plan; tag?: string; highlight?: boolean; children: React.ReactNode }) {
  return (
    <article className={`relative flex h-full flex-col gap-4 rounded-[var(--radius-lg)] border bg-panel p-5 shadow-card ${highlight ? "border-ink border-2 mt-2 md:mt-0" : "border-line"}`}>
      {tag && <span className="absolute -top-3 left-5 rounded-full bg-lime px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink">{tag}</span>}
      <div>
        <h2 className="font-display text-xl font-extrabold tracking-tight">{plan.name}</h2>
        <p className="text-sm text-ink-soft">{plan.blurb}</p>
      </div>
      <DayStrip days={plan.days} />
      {children}
    </article>
  );
}

function Price({ was, n, per }: { was?: string; n: string; per: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      {was && <span className="font-display text-xl font-bold text-ink-soft line-through decoration-2 tabular-nums">{was}</span>}
      <span className="font-display text-4xl font-extrabold tracking-tight tabular-nums">{n}</span>
      <span className="text-sm text-ink-soft">{per}</span>
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="-mt-2 text-sm text-ink-secondary tabular-nums">{children}</p>;
}

/** "Sat 17 Oct". */
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" }).replace(",", "");

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** "Wednesday 7 October", without the year a trial never needs. */
const shortDate = (iso: string) => longDate(iso).replace(/\s\d{4}$/, "");

/**
 * Admin only (or anyone on the dev server), ?preview=year|quarter|failed|month:
 * the page as an Every day trialist on that term sees it, with sample numbers and no Stripe calls.
 */
function preview(kind: string): Data {
  const plan = planById("everyday")!;
  const term = termById(kind === "quarter" ? "quarter" : kind === "month" ? "month" : "year");
  const month = termById("month");
  const chargeOn = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const cheaper: Downgrades = { subscriptionId: "preview", current: plan.name, trialing: true, term: month, options: PLANS.filter((o) => o.price < plan.price).map((o) => ({ plan: o, price: termPrice(o, month) })) };
  if (kind === "month") return [{ subscriptionId: "preview", planName: plan.name, full: plan.price, offered: plan.price / 2, chargeOn }, cheaper, null];
  const monthly: MonthlySwitch = { subscriptionId: "preview", planName: plan.name, term, termPrice: termPrice(plan, term), monthly: plan.price, chargeOn: kind === "failed" ? undefined : chargeOn, failedInvoice: kind === "failed" ? "preview" : undefined };
  return [{ reason: "not-eligible" }, cheaper, monthly];
}
