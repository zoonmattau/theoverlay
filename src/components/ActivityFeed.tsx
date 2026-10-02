import Link from "next/link";

import { now, type Event, type Member, type PassDay } from "@/lib/admin";
import { planById } from "@/lib/billing/plans";

type Tone = "prime" | "bet" | "lay";

interface Line {
  tone: Tone;
  /** What happened, without the who. */
  text: string;
  /** Lines with the same key for a person show once, the newest: by default the text itself. */
  key?: string;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const plan = (id: string | null) => (id ? (planById(id)?.name ?? id) : "a plan");
const str = (v: unknown) => (typeof v === "string" ? v : "");
/** How often the plan bills: the event's own term, else the member's current one for events logged before it was. */
const TERM: Record<string, string> = { month: "monthly", quarter: "every 3 months", year: "yearly" };
const short = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });

/**
 * One event as a sentence and a colour, or nothing when it is not worth
 * reading: only people joining, money in, money at risk, and things that broke.
 */
function describe(e: Event, member?: Member): Line | null {
  const m = e.meta ?? {};
  switch (e.kind) {
    case "joined":
      return { tone: "prime", text: "signed up" };
    case "payment":
      // A pass is logged twice, as the payment and the checkout, a moment apart; both share a key so one line shows.
      return { tone: "bet", text: `paid ${money(e.amount_cents ?? 0)} for ${plan(e.plan)}`, key: e.plan?.startsWith("passes_") ? `pass|${e.plan}|${e.created_at.slice(0, 16)}` : undefined };
    case "checkout_completed":
      return e.plan?.startsWith("passes_") ? { tone: "bet", text: `bought ${e.plan.slice(7)} day ${e.plan === "passes_1" ? "pass" : "passes"} for ${money(e.amount_cents ?? 0)}`, key: `pass|${e.plan}|${e.created_at.slice(0, 16)}` } : null;
    case "subscription":
      // Renewals, retries and endings repeat what the payment, grace and cancel lines already say.
      if (m.status !== "canceled" && (m.cancelAtPeriodEnd || m.cancelAt)) {
        const ends = str(m.cancelAt) || str(m.until);
        // Stripe sends a cancellation twice, a second apart: "cancellation_requested", then the reason the member picked. One line, the newest.
        const reason = str(m.cancelReason) === "cancellation_requested" ? "" : str(m.cancelReason);
        return { tone: "lay", key: `cancel|${ends}`, text: `cancelled ${plan(e.plan)}, on until ${ends ? short(ends) : "the period ends"}${reason ? ` (${reason.replace(/_/g, " ")})` : ""}` };
      }
      if (m.status === "trialing") {
        const term = TERM[str(m.term) || (member?.billing_term ?? "")];
        return { tone: "prime", text: `started a free trial of ${plan(e.plan)}${term ? `, ${term}` : ""}` };
      }
      return null;
    case "ig_follow_claim": {
      const handle = str(m.handle) ? ` (@${str(m.handle)})` : "";
      // A free day runs to midnight at its end: the day before the stored instant.
      if (m.nextBill) return { tone: "prime", text: `followed on Instagram${handle}, next bill moved to ${short(str(m.nextBill))}` };
      return { tone: "prime", text: `followed on Instagram${handle} for a free day, ${m.until ? short(new Date(new Date(str(m.until)).getTime() - 1).toISOString()) : "today"}` };
    }
    case "pass_used":
      return { tone: "prime", text: `used a day pass on ${new Date(`${str(m.date)}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" })}` };
    case "payment_grace":
      return { tone: "lay", text: `payment failed, access held until ${m.until ? short(str(m.until)) : "it is paid"}` };
    case "comeback":
      return { tone: "prime", text: `came back on ${plan(e.plan)}` };
    case "retention_offer":
      return m.taken ? { tone: "prime", text: "was going to cancel and took the offer to stay" } : null;
    case "downgrade":
      return { tone: "lay", text: `moved down from ${plan(str(m.from) || null)} to ${plan(e.plan)}` };
    case "winback":
    case "signup_chase":
      return m.emailed === false ? { tone: "lay", text: "was not sent an email that should have gone: it failed" } : null;
    case "admin":
      return str(m.action).endsWith("failed") ? { tone: "lay", text: `${str(m.action).replace(/_failed$/, "").replace(/_/g, " ")} failed: ${str(m.error)}` } : null;
    default:
      return null;
  }
}

const DOT: Record<Tone, string> = { prime: "bg-lime", bet: "bg-blue", lay: "bg-red" };

function dayLabel(iso: string, today: string, yesterday: string): string {
  const d = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short", timeZone: "Australia/Sydney" });
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

/**
 * What has happened that is worth knowing, newest first, grouped by day: who
 * did what in a sentence, a dot in the colour of the news. Green is someone
 * joining or staying, blue is money in, red is money at risk or something broken.
 */
export function ActivityFeed({ events, members, passDays = [] }: { events: Event[]; members: Member[]; passDays?: PassDay[] }) {
  const who = new Map(members.map((m) => [m.id, m]));
  const at = now();
  const today = new Date(at).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const yesterday = new Date(at - 86400_000).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  // Sign-ups are not events; they come from the accounts, as far back as the events reach.
  const oldest = events.length ? events[events.length - 1].created_at : new Date(at - 7 * 86400_000).toISOString();
  const joined: Event[] = members
    .filter((m) => m.created_at && m.created_at >= oldest && !m.is_admin)
    .map((m) => ({ id: -new Date(m.created_at).getTime(), user_id: m.id, kind: "joined", plan: null, amount_cents: null, meta: null, created_at: m.created_at }));
  // Nor are passes spent: those are rows in day_passes.
  const used: Event[] = passDays
    .filter((p) => p.created_at >= oldest)
    .map((p) => ({ id: -new Date(p.created_at).getTime() - 1, user_id: p.user_id, kind: "pass_used", plan: null, amount_cents: null, meta: { date: p.date }, created_at: p.created_at }));
  // Stripe says the same thing several times; each person's news shows once, newest.
  const seen = new Set<string>();
  const rows = [...events, ...joined, ...used]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .flatMap((e) => {
      const line = describe(e, e.user_id ? who.get(e.user_id) : undefined);
      const key = `${e.user_id}|${line?.key ?? line?.text}`;
      if (!line || (e.user_id && seen.has(key))) return [];
      seen.add(key);
      return [{ e, line }];
    });
  const days: { label: string; rows: typeof rows }[] = [];
  for (const r of rows) {
    const label = dayLabel(r.e.created_at, today, yesterday);
    const last = days[days.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else days.push({ label, rows: [r] });
  }
  return (
    <div className="section">
      <div className="section-bar">
        <span className="section-letter">E</span>
        <h2>Recent activity</h2>
      </div>
      {days.length === 0 && <p className="p-4 text-sm text-ink-soft">Nothing yet.</p>}
      {days.map((d) => (
        <div key={d.label}>
          <div className="px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] font-bold text-ink-soft bg-panel-alt border-y border-line-soft">{d.label}</div>
          <ul className="divide-y divide-line-soft">
            {d.rows.map(({ e, line }) => {
              const m = e.user_id ? who.get(e.user_id) : undefined;
              const name = m?.full_name || m?.email || (e.user_id ? "a member" : "");
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
