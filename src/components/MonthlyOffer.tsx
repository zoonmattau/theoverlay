import { payMonthlyToday } from "@/app/account/cancel/actions";
import type { MonthlySwitch } from "@/lib/billing/retention";
import { longDate } from "@/lib/format";

/**
 * For a yearly or 3-month trial on the way out: pay the first month today,
 * on the monthly price, and it runs a week longer. One offer, not two: a
 * plain switch to monthly gave nothing for deciding now (2 Oct 2026).
 */
export function MonthlyOffer({ offer, declined }: { offer: MonthlySwitch; declined?: boolean }) {
  const when = offer.chargeOn ? longDate(offer.chargeOn) : "when your trial ends";
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.1em] text-ink-soft font-bold">Before you go</p>
      <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Pay today, get a week free.</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        Your {offer.planName} trial is on the {offer.term.name.toLowerCase()} price, <strong className="nums">${offer.termPrice}</strong> in one bill on {when}. Pay <strong className="nums">${offer.monthly}</strong> for your first month today instead, and it runs 5 weeks. After that it is ${offer.monthly} a month, and you can cancel any month.
      </p>
      <div className="card border-lime bg-lime-soft mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-display text-xl font-extrabold tracking-tight nums">${offer.monthly} for 5 weeks</div>
          <div className="text-sm text-ink-secondary nums">instead of ${offer.termPrice} up front. Your next bill is 5 weeks away.</div>
          {declined && <div className="mt-1 text-sm text-red font-semibold">Your card was declined, so nothing changed. Update it from your account and try again.</div>}
        </div>
        <form action={payMonthlyToday}>
          <button type="submit" className="btn btn-primary">Pay ${offer.monthly} today</button>
        </form>
      </div>
    </div>
  );
}
