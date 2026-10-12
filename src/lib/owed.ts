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
  costId: string;
  what: string;
  amount_cents: number;
  /** yyyy-mm this month's bill, and the day it falls due. */
  month: string;
  due: string;
  /** When this month's bill was marked paid, if it has been. */
  paidAt?: string;
  /** yyyy-mm-dd of the one after. */
  next: string;
}

/** A payment going out that has been marked paid: an affiliate's month, or a monthly bill. */
export interface PaidOut {
  /** When it was marked paid. */
  at: string;
  to: string;
  /** "Commission, October 2026", "Form King subscription, October 2026". */
  what: string;
  amount_cents: number;
  note: string | null;
}

export interface Owed {
  affiliates: OwedAffiliate[];
  bills: Bill[];
  owed_cents: number;
  /** Everything marked paid, newest first. */
  paid: PaidOut[];
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
  const [{ data: affs }, { data: people }, { data: payments }, { data: payouts }, { data: costs }, { data: billsPaid }] = await Promise.all([
    db.from("affiliates").select("*"),
    db.from("profiles").select("id, email, full_name, affiliate_id, billing_term").not("affiliate_id", "is", null),
    db.from("events").select("user_id, plan, amount_cents, created_at, meta").eq("kind", "payment").order("created_at", { ascending: false }),
    db.from("affiliate_payouts").select("affiliate_id, month, amount_cents, paid_at, note"),
    db.from("costs").select("id, date, amount_cents, what, monthly, stopped").eq("monthly", true),
    db.from("events").select("created_at, meta").eq("kind", "bill_paid"),
  ]);
  // A monthly bill marked paid from this page: one event per bill per month (12 Oct 2026).
  const paidBill = new Map(((billsPaid ?? []) as { created_at: string; meta: { cost?: string; month?: string } | null }[]).map((e) => [`${e.meta?.cost}:${e.meta?.month}`, e.created_at]));
  const monthLabel = (m: string) => new Date(`${m}-15T12:00:00+10:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "Australia/Sydney" });
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
  // Each monthly bill falls on the same day of the month as its first date. This month's shows
  // with Mark paid until it is; a stopped line counts through its last month and no further.
  const [ty, tm] = today.split("-").map(Number);
  const at = (dom: number, yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(dom, last)).padStart(2, "0")}`;
  };
  const bills: Bill[] = ((costs ?? []) as { id: string; date: string; amount_cents: number; what: string; stopped: string | null }[])
    .filter((c) => c.date.slice(0, 7) <= today.slice(0, 7) && (!c.stopped || c.stopped.slice(0, 7) >= today.slice(0, 7)))
    .map((c) => {
      const dom = Number(c.date.slice(8, 10));
      const month = today.slice(0, 7);
      const due = at(dom, ty, tm);
      const next = tm === 12 ? at(dom, ty + 1, 1) : at(dom, ty, tm + 1);
      return { costId: c.id, what: c.what, amount_cents: c.amount_cents, month, due, paidAt: paidBill.get(`${c.id}:${month}`), next };
    })
    .sort((x, y) => x.due.localeCompare(y.due));

  // What has gone out: each affiliate month marked paid, and each monthly bill marked paid.
  const affName = new Map(((affs ?? []) as Affiliate[]).map((a) => [a.id, a.name]));
  const costOf = new Map(((costs ?? []) as { id: string; what: string; amount_cents: number }[]).map((c) => [c.id, c]));
  const paidOut: PaidOut[] = [
    ...(paid as { affiliate_id: string; month: string; amount_cents: number; paid_at: string; note?: string | null }[]).map((p) => ({ at: p.paid_at, to: affName.get(p.affiliate_id) ?? "an affiliate", what: `Commission, ${monthLabel(p.month)}`, amount_cents: p.amount_cents, note: p.note ?? null })),
    ...((billsPaid ?? []) as { created_at: string; meta: { cost?: string; month?: string } | null }[]).flatMap((e) => {
      const c = e.meta?.cost ? costOf.get(e.meta.cost) : undefined;
      return c && e.meta?.month ? [{ at: e.created_at, to: c.what.replace(/ subscription$/i, ""), what: `${c.what}, ${monthLabel(e.meta.month)}`, amount_cents: c.amount_cents, note: null }] : [];
    }),
  ].sort((x, y) => y.at.localeCompare(x.at));

  return {
    affiliates: affiliates.filter((a) => a.owed_cents > 0 || a.paid_cents > 0).sort((x, y) => y.owed_cents - x.owed_cents),
    bills,
    owed_cents: affiliates.reduce((s, a) => s + a.owed_cents, 0),
    paid: paidOut,
  };
}

/**
 * Commission earned by day, paid out or not, for the Money page: an affiliate's
 * share of a payment is a cost the day the payment lands, never the business's
 * income (the user, 12 Oct 2026). Dollars, Sydney days, with the affiliate's code.
 */
export async function commissionByDay(): Promise<{ date: string; code: string; amount: number }[]> {
  const db = supabaseAdmin();
  const [{ data: affs }, { data: people }, { data: payments }] = await Promise.all([
    db.from("affiliates").select("id, code, commission_pct"),
    db.from("profiles").select("id, affiliate_id").not("affiliate_id", "is", null),
    db.from("events").select("user_id, amount_cents, created_at").eq("kind", "payment"),
  ]);
  const aff = new Map(((affs ?? []) as { id: string; code: string; commission_pct: number }[]).map((a) => [a.id, a]));
  const of = new Map(((people ?? []) as { id: string; affiliate_id: string }[]).map((p) => [p.id, aff.get(p.affiliate_id)]));
  const out: { date: string; code: string; amount: number }[] = [];
  for (const e of (payments ?? []) as { user_id: string | null; amount_cents: number | null; created_at: string }[]) {
    const a = e.user_id ? of.get(e.user_id) : undefined;
    if (!a || !e.amount_cents) continue;
    out.push({ date: sydneyDay(e.created_at), code: a.code, amount: Math.round(e.amount_cents * Number(a.commission_pct)) / 10000 });
  }
  return out;
}
