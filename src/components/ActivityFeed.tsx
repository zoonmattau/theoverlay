import Link from "next/link";

import { now, type Event, type Member } from "@/lib/admin";
import { planById } from "@/lib/billing/plans";

type Tone = "prime" | "bet" | "lay" | "muted";

interface Line {
  tone: Tone;
  /** What happened, without the who. */
  text: string;
  /** money, members or admin, for the filter. */
  group: "money" | "members" | "admin";
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const plan = (id: string | null) => (id ? (planById(id)?.name ?? id) : "a plan");
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const short = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });

/** One event as a sentence and a colour. */
function describe(e: Event): Line {
  const m = e.meta ?? {};
  switch (e.kind) {
    case "payment":
      return { tone: "bet", text: `paid ${money(e.amount_cents ?? 0)} for ${plan(e.plan)}`, group: "money" };
    case "subscription": {
      const status = str(m.status);
      if (m.cancelAtPeriodEnd) return { tone: "lay", text: `cancelled ${plan(e.plan)}, on until ${m.until ? short(str(m.until)) : "the period ends"}`, group: "money" };
      if (status === "trialing") return { tone: "prime", text: `started a free trial of ${plan(e.plan)}`, group: "money" };
      if (status === "active") return { tone: "prime", text: `is subscribed to ${plan(e.plan)}`, group: "money" };
      if (status === "past_due" || status === "unpaid") return { tone: "lay", text: `payment failed on ${plan(e.plan)}`, group: "money" };
      if (status === "canceled") return { tone: "lay", text: `${plan(e.plan)} ended`, group: "money" };
      return { tone: "muted", text: `${plan(e.plan)} is ${status || "updated"}`, group: "money" };
    }
    case "checkout_started":
      return { tone: "muted", text: `opened checkout for ${plan(e.plan)}${m.trial === false ? ", no trial" : ""}`, group: "money" };
    case "checkout_completed":
      return { tone: "bet", text: e.plan?.startsWith("passes_") ? `bought ${e.plan.slice(7)} day ${e.plan === "passes_1" ? "pass" : "passes"} for ${money(e.amount_cents ?? 0)}` : `finished checkout for ${plan(e.plan)}`, group: "money" };
    case "plan_click":
      return { tone: "muted", text: `looked at the ${plan(e.plan)} plan`, group: "members" };
    case "bookie_click":
      return { tone: "muted", text: `followed a price to ${str(m.bookie) || "a bookie"}`, group: "members" };
    case "tips_email":
      return { tone: "prime", text: `tips email went to ${num(m.sent)} ${num(m.sent) === 1 ? "member" : "members"}`, group: "admin" };
    case "tipster_email":
      return { tone: "prime", text: `${str(m.tipster)} tips went to ${num(m.sent)} ${num(m.sent) === 1 ? "follower" : "followers"}`, group: "admin" };
    case "admin":
      return { tone: str(m.action).endsWith("failed") ? "lay" : "muted", text: adminAction(m, e.amount_cents ?? 0), group: "admin" };
    default:
      return { tone: "muted", text: e.kind.replace(/_/g, " "), group: "members" };
  }
}

function adminAction(m: Record<string, unknown>, cents: number): string {
  const by = str(m.by).split("@")[0];
  const who = by ? `${by} ` : "";
  switch (str(m.action)) {
    case "rebuild_card": return `${who}rebuilt the card, ${num(m.races)} races in ${num(m.seconds)}s`;
    case "resend_tips": return `${who}resent the tips email to ${num(m.sent)}`;
    case "free_race": return `${who}set the free race to ${str(m.raceId) || "automatic"}`;
    case "add_days": return `${who}gave ${num(m.days)} days`;
    case "add_passes": return `${who}gave ${num(m.qty ?? m.passes)} day passes`;
    case "pause": return `${who}paused the account`;
    case "resume": return `${who}resumed the account`;
    case "cancel": return `${who}cancelled the subscription`;
    case "invite": return `${who}invited ${str(m.email)}`;
    case "invite_failed": return `invite to ${str(m.email)} failed: ${str(m.error)}`;
    case "resend_invite": return `${who}resent the invite`;
    case "resend_invite_failed": return `resending the invite failed: ${str(m.error)}`;
    case "delete": return `${who}deleted ${str(m.email) || "an account"}`;
    case "delete_failed": return `delete failed: ${str(m.error)}`;
    case "make_tipster": return `${who}made a tipster, code ${str(m.code)}`;
    case "unmake_tipster": return `${who}took tipster away`;
    case "set_admin": return `${who}${m.on ? "made an admin" : "took admin away"}`;
    case "affiliate_create": return `${who}created affiliate ${str(m.code)}`;
    case "affiliate_invite_failed": return `invite for affiliate ${str(m.code)} failed: ${str(m.error)}`;
    case "delete_affiliate": return `${who}deleted affiliate ${str(m.code)}`;
    case "affiliate_paid": return `${who}paid an affiliate ${money(cents)} for ${str(m.month)}`;
    default: return `${who}${str(m.action).replace(/_/g, " ") || "did something"}`;
  }
}

const DOT: Record<Tone, string> = { prime: "bg-lime", bet: "bg-blue", lay: "bg-red", muted: "bg-surface-alt" };

function dayLabel(iso: string, today: string, yesterday: string): string {
  const d = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short", timeZone: "Australia/Sydney" });
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

/**
 * What has happened, newest first, grouped by day: who did what in a
 * sentence, a dot in the colour of the news, and a filter for money,
 * members or admin.
 */
export function ActivityFeed({ events, members, filter, base }: { events: Event[]; members: Member[]; filter: string; base: string }) {
  const who = new Map(members.map((m) => [m.id, m]));
  const at = now();
  const today = new Date(at).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const yesterday = new Date(at - 86400_000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const rows = events.map((e) => ({ e, line: describe(e) })).filter((r) => filter === "all" || r.line.group === filter);
  const days: { label: string; rows: typeof rows }[] = [];
  for (const r of rows) {
    const label = dayLabel(r.e.created_at, today, yesterday);
    const last = days[days.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else days.push({ label, rows: [r] });
  }
  const tabs: [string, string][] = [["all", "All"], ["money", "Money"], ["members", "Members"], ["admin", "Admin"]];
  return (
    <div className="section">
      <div className="section-bar">
        <span className="section-letter">E</span>
        <h2>Recent activity</h2>
        <div className="ml-auto flex gap-1 text-xs" role="tablist">
          {tabs.map(([key, label]) => (
            <Link key={key} href={key === "all" ? base : `${base}?activity=${key}`} scroll={false} role="tab" aria-selected={filter === key} className="tab">{label}</Link>
          ))}
        </div>
      </div>
      {days.length === 0 && <p className="p-4 text-sm text-ink-soft">Nothing yet.</p>}
      {days.map((d) => (
        <div key={d.label}>
          <div className="px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] font-bold text-ink-soft bg-panel-alt border-y border-line-soft">{d.label}</div>
          <ul className="divide-y divide-line-soft">
            {d.rows.map(({ e, line }) => {
              const m = e.user_id ? who.get(e.user_id) : undefined;
              const name = m?.full_name || m?.email || (e.user_id ? "a member" : e.meta?.anonymous ? "A visitor" : "");
              return (
                <li key={e.id} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                  <span className="nums text-xs text-ink-soft w-16 shrink-0">{clock(e.created_at)}</span>
                  <span className={`legend-dot ${DOT[line.tone]} shrink-0`} />
                  <span className="min-w-0">
                    {m ? <Link href={`/admin/${m.id}`} className="font-semibold hover:text-blue">{name}</Link> : name ? <span className="font-semibold">{name}</span> : null}
                    {name ? " " : ""}
                    {name ? line.text : line.text[0].toUpperCase() + line.text.slice(1)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
