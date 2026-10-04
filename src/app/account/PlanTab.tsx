import Link from "next/link";

import { moveToPlan } from "@/app/account/cancel/actions";
import { PlanCard, PlanLine, PlanPrice } from "@/components/PlanCard";
import { PortalButton } from "@/components/PortalButton";
import type { Viewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { PLANS, termById, termPrice, type Plan, type Term } from "@/lib/billing/plans";
import { switchesFor } from "@/lib/billing/retention";
import { longDate } from "@/lib/format";

export type PlanStatus = "trialing" | "active" | "past_due" | "cancelling";

/** Admin preview of the tab: the member's state without a subscription behind it. */
export interface PlanPreview {
  status: PlanStatus;
  term: Term;
}

/**
 * Plan and billing, in the pricing page's shape: their plan as a card (a
 * Free trial tag while it runs), the other plans beside it to switch to in
 * place, card and invoices behind Stripe, and Cancel plan at the foot. What
 * the plan costs, never when the money comes out.
 */
export async function PlanTab({ viewer, plan, preview }: { viewer: Viewer; plan: Plan; preview?: PlanPreview }) {
  const state = preview ?? (await stateOf(viewer.id!));
  const options = preview
    ? PLANS.filter((o) => o.id !== plan.id).map((o) => ({ plan: o, price: termPrice(o, preview.term) }))
    : ((await switchesFor(viewer.id!, "change"))?.options ?? []);
  const { status, term } = state;
  const per = term.id === "month" ? "/month" : term.id === "year" ? "/year" : "/3 months";
  const every = term.id === "month" ? "a month" : term.id === "year" ? "a year" : "every 3 months";
  const mine = termPrice(plan, term);
  const until = viewer.accessUntil ? longDate(viewer.accessUntil.slice(0, 10)).replace(/\s\d{4}$/, "") : undefined;
  const settled = status === "trialing" || status === "active";

  return (
    <div>
      {status === "past_due" && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border-2 border-red bg-panel p-4">
          <div>
            <div className="font-display font-extrabold tracking-tight">Your last payment didn&apos;t go through.</div>
            <div className="text-sm text-ink-secondary">Pay now to keep the board open.</div>
          </div>
          <Link href="/account/pay" className="btn btn-primary btn-sm">Pay now</Link>
        </div>
      )}
      {status === "cancelling" && (
        <div className="mb-5 rounded-[var(--radius-lg)] border border-line bg-panel p-4 text-sm">
          <strong>Cancelled.</strong> The board stays open{until ? ` until ${until}` : ""}. Changed your mind? Undo it under Manage subscription.
        </div>
      )}

      <div className="max-w-md">
        <PlanCard strip={false} plan={plan} tag={status === "trialing" ? "Free trial" : "Your plan"} highlight>
          <PlanPrice n={`$${mine}`} per={per} />
          {status !== "cancelling" && <PlanLine>{status === "trialing" ? "On your free trial. Cancel any time." : "Cancel any time."}</PlanLine>}
          {viewer.stripeCustomerId && (
            <div className="mt-auto">
              <PortalButton />
              <p className="mt-2 text-xs text-ink-soft">Your card and every invoice, held by Stripe.</p>
            </div>
          )}
        </PlanCard>
      </div>

      {settled && options.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-lg font-extrabold tracking-tight">Change plan</h3>
          <p className="text-sm text-ink-soft">More days or fewer, switched straight away.{status === "trialing" ? " Your trial carries on." : ""}</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {options.map(({ plan: p, price }) => {
              const diff = price - mine;
              return (
                <PlanCard strip={false} key={p.id} plan={p}>
                  <PlanPrice n={`$${price}`} per={per} />
                  <PlanLine>
                    {diff < 0 ? <span className="font-semibold text-accent">Save ${-diff} {every}.</span> : <>{p.days.length ? "More days." : "Every day, the full board."}</>}
                  </PlanLine>
                  <form action={moveToPlan} className="mt-auto">
                    <input type="hidden" name="plan" value={p.id} />
                    <input type="hidden" name="from" value="change" />
                    <button type="submit" className="btn btn-secondary w-full">Switch to {p.name}</button>
                  </form>
                </PlanCard>
              );
            })}
          </div>
        </div>
      )}

      {viewer.stripeCustomerId && status !== "cancelling" && (
        <div className="mt-8 border-t border-line-soft pt-4">
          <Link href="/account/cancel" className="text-sm font-semibold text-ink-soft underline underline-offset-2 hover:text-ink">Cancel plan</Link>
        </div>
      )}
    </div>
  );
}

async function stateOf(userId: string): Promise<{ status: PlanStatus; term: Term }> {
  const { data } = await supabaseAdmin().from("profiles").select("subscription_status, billing_term, cancel_at").eq("id", userId).maybeSingle();
  const status: PlanStatus = data?.subscription_status === "past_due" ? "past_due" : data?.cancel_at ? "cancelling" : data?.subscription_status === "trialing" ? "trialing" : "active";
  return { status, term: termById(data?.billing_term ?? undefined) };
}

/** ?status= and ?term= for the admin preview, read off the query. */
export function previewOf(sp: Record<string, string | string[] | undefined>): PlanPreview {
  const s = typeof sp.status === "string" && ["trialing", "active", "past_due", "cancelling"].includes(sp.status) ? (sp.status as PlanStatus) : "trialing";
  return { status: s, term: termById(typeof sp.term === "string" ? sp.term : "month") };
}
