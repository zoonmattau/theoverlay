import "server-only";

import type { Affiliate } from "@/lib/affiliates";
import { supabaseAdmin } from "@/lib/billing/access";
import { planById, termById } from "@/lib/billing/plans";

/**
 * Who the business owes, why and how much (the user, 12 Oct 2026): each
 * affiliate's commission on what their members paid, payment by payment, for
 * every month not yet marked paid; and the monthly bills still running, with
 * the day each next falls due.
 */

export interface OwedLine {
  /** yyyy-mm-dd, Sydney. */
  date: string;
  memberId: string;
  who: string;
  /** "Every day, monthly", "3 day passes". */
  what: string;
  amount_cents: number;
  commission_cents: number;
}

export interface OwedMonth {
  /** yyyy-mm, Sydney. */
  month: string;
  lines: OwedLine[];
  commission_cents: number;
}

export interface OwedAffiliate {
  affiliate: Affiliate;
  /** Months with commission not yet marked paid, newest first. */
  unpaid: OwedMonth[];
  owed_cents: number;
  paid_cents: number;
  lastPaid?: { month: string; at: string; cents: number };
}

export interface Bill {
  what: string;
  amount_cents: number;
  /** yyyy-mm-dd the next one falls due. */
  next: string;
}

export interface Owed {
  affiliates: OwedAffiliate[];
  bills: Bill[];
  owed_cents: number;
}

const sydneyDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

/** The payment as a member reads it: the plan and term from the payment, or a pass bundle. */
function whatFor(plan: string | null, term: string | null): string {
  const passes = plan?.match(/^passes_(\d+)$/);
  if (passes) return `${passes[1]} day ${passes[1] === "1" ? "pass" : "passes"}`;
  const p = planById(plan ?? undefined);
  if (!p) return plan ?? "a payment";
  return term ? `${p.name}, ${termById(term).name.toLowerCase()}` : p.name;
}

export async function owedReport(): Promise<Owed> {
  const db = supabaseAdmin();
  const [{ data: affs }, { data: people }, { data: payments }, { data: payouts }, { data: costs }] = await Promise.all([
    db.from("affiliates").select("*"),
    db.from("profiles").select("id, email, full_name, affiliate_id, billing_term").not("affiliate_id", "is", null),
    db.from("events").select("user_id, plan, amount_cents, created_at, meta").eq("kind", "payment").order("created_at", { ascending: false }),
    db.from("affiliate_payouts").select("affiliate_id, month, amount_cents, paid_at"),
    db.from("costs").select("date, amount_cents, what, monthly, stopped").eq("monthly", true),
  ]);
  const person = new Map(((people ?? []) as { id: string; email: string | null; full_name: string | null; affiliate_id: string; billing_term: string | null }[]).map((p) => [p.id, p]));
  const paid = (payouts ?? []) as { affiliate_id: string; month: string; amount_cents: number; paid_at: string }[];
  const paidMonths = new Set(paid.map((p) => `${p.affiliate_id}:${p.month}`));

  const affiliates = ((affs ?? []) as Affiliate[]).map((a): OwedAffiliate => {
    const pct = Number(a.commission_pct) / 100;
    const months = new Map<string, OwedLine[]>();
    for (const e of (payments ?? []) as { user_id: string | null; plan: string | null; amount_cents: number | null; created_at: string; meta: { term?: string } | null }[]) {
      const p = e.user_id ? person.get(e.user_id) : undefined;
      if (!p || p.affiliate_id !== a.id || !e.amount_cents) continue;
      const date = sydneyDay(e.created_at);
      const month = date.slice(0, 7);
      if (paidMonths.has(`${a.id}:${month}`)) continue;
      const line: OwedLine = {
        date,
        memberId: p.id,
        who: p.full_name || p.email || "a member",
        what: whatFor(e.plan, e.meta?.term ?? (e.plan?.startsWith("passes_") ? null : p.billing_term)),
        amount_cents: e.amount_cents,
        commission_cents: Math.round(e.amount_cents * pct),
      };
      months.set(month, [...(months.get(month) ?? []), line]);
    }
    const unpaid = [...months.entries()]
      .map(([month, lines]) => ({ month, lines, commission_cents: lines.reduce((s, l) => s + l.commission_cents, 0) }))
      .sort((x, y) => y.month.localeCompare(x.month));
    const mine = paid.filter((p) => p.affiliate_id === a.id).sort((x, y) => y.paid_at.localeCompare(x.paid_at));
    return {
      affiliate: a,
      unpaid,
      owed_cents: unpaid.reduce((s, m) => s + m.commission_cents, 0),
      paid_cents: mine.reduce((s, p) => s + p.amount_cents, 0),
      lastPaid: mine[0] ? { month: mine[0].month, at: mine[0].paid_at, cents: mine[0].amount_cents } : undefined,
    };
  });

  // A monthly bill falls on the same day of the month as its first date, from this month on, until it is stopped.
  const today = sydneyDay(new Date().toISOString());
  const bills = ((costs ?? []) as { date: string; amount_cents: number; what: string; stopped: string | null }[])
    .map((c) => {
      const dom = Number(c.date.slice(8, 10));
      const [y, m] = today.split("-").map(Number);
      const at = (yy: number, mm: number) => {
        const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
        return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(dom, last)).padStart(2, "0")}`;
      };
      let next = at(y, m);
      if (next < today) next = m === 12 ? at(y + 1, 1) : at(y, m + 1);
      return { what: c.what, amount_cents: c.amount_cents, next, stopped: c.stopped };
    })
    // A stopped line counts through its last month and no further.
    .filter((b) => !b.stopped || b.next.slice(0, 7) <= b.stopped.slice(0, 7))
    .map((b) => ({ what: b.what, amount_cents: b.amount_cents, next: b.next }))
    .sort((x, y) => x.next.localeCompare(y.next));

  return {
    affiliates: affiliates.filter((a) => a.owed_cents > 0 || a.paid_cents > 0).sort((x, y) => y.owed_cents - x.owed_cents),
    bills,
    owed_cents: affiliates.reduce((s, a) => s + a.owed_cents, 0),
  };
}
