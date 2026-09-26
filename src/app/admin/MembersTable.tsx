"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { Section } from "@/components/Section";

/** One member as the table needs it: display strings plus raw values to sort on. */
export interface MemberRow {
  id: string;
  name: string;
  email: string;
  /** Everything searchable, lower case: name, email, phone, suburb, code. */
  haystack: string;
  /** Cancelled: the account is live but a cancellation is booked; access runs to its date and no more. */
  account: "active" | "cancelled" | "invited" | "unconfirmed";
  admin: boolean;
  tipster: boolean;
  plan: string;
  /** The affiliate code they signed up through, or "" for none. */
  affiliate: string;
  /** signup, invite, google or affiliate. */
  source: string;
  status: "live" | "paused" | "none";
  statusLabel: string;
  accessUntil: number;
  since: number;
  spent: number;
  passes: number;
  emails: boolean;
  lastSeen: number;
  /** Which group they fall in, one each: paying, trial, gift, paused, lapsed, none (confirmed, never a plan), pending (invited or unconfirmed), tipster, admin. */
  category: Category;
  /** Their name on Discord once linked, or "". */
  discord: string;
  /** member: in the server with the Member role; joined: in the server without it; linked: linked but not in the server; none: never linked. */
  discordState: "member" | "joined" | "linked" | "none";
}

export type Category = "paying" | "trial" | "gift" | "paused" | "lapsed" | "none" | "unconfirmed" | "invited" | "tipster" | "admin";
/** The groups, in the order the Groups view lists them, with what each means. */
const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: "paying", label: "Live", hint: "A plan that has been billed and is running" },
  { id: "trial", label: "On trial", hint: "A plan still in its free trial" },
  { id: "gift", label: "Gift days", hint: "Gifted or referral days running, no plan" },
  { id: "paused", label: "Paused", hint: "Plan paused, nothing charged" },
  { id: "lapsed", label: "Lapsed", hint: "Had a plan or gift days, access has ended" },
  { id: "none", label: "No plan", hint: "Confirmed, never started a plan" },
  { id: "unconfirmed", label: "Not confirmed", hint: "Signed up, never pressed the confirm link" },
  { id: "invited", label: "Not signed up", hint: "Invited, never set a password" },
  { id: "tipster", label: "Tipsters", hint: "Post their own calls" },
  { id: "admin", label: "Admins", hint: "" },
];

type Key = "name" | "account" | "plan" | "affiliate" | "status" | "accessUntil" | "since" | "spent" | "passes" | "emails" | "lastSeen" | "discordState";

const COLS: { key: Key; label: string; right?: boolean }[] = [
  { key: "name", label: "Member" },
  { key: "account", label: "Account" },
  { key: "plan", label: "Plan" },
  { key: "affiliate", label: "Came from" },
  { key: "status", label: "Status" },
  { key: "accessUntil", label: "Access until" },
  { key: "since", label: "Since" },
  { key: "spent", label: "Spent", right: true },
  { key: "passes", label: "Passes", right: true },
  { key: "emails", label: "Emails" },
  { key: "discordState", label: "Discord" },
  { key: "lastSeen", label: "Last seen" },
];
const DISCORD_ORDER = { member: 0, joined: 1, linked: 2, none: 3 };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (t: number) => (t ? new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }) : "—");
const when = (t: number) => (t ? new Date(t).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "never");

/** The member list: search as you type, filter by status, plan, account and emails, sort on any column, collapse the lot. */
export function MembersTable({ rows, plans, remove, self }: { rows: MemberRow[]; plans: string[]; remove: (id: string) => Promise<void>; self?: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "live" | "paused" | "none">("all");
  const [plan, setPlan] = useState("all");
  const [account, setAccount] = useState<"all" | "active" | "cancelled" | "invited" | "unconfirmed">("all");
  const [emails, setEmails] = useState<"all" | "on" | "off">("all");
  const [discord, setDiscord] = useState<"all" | MemberRow["discordState"]>("all");
  const [view, setView] = useState<"table" | "groups">("table");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "since", dir: -1 });

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (m) =>
        (!needle || m.haystack.includes(needle)) &&
        (status === "all" || m.status === status) &&
        (plan === "all" || (plan === "tipster" ? m.tipster : m.plan === plan)) &&
        (account === "all" || m.account === account) &&
        (emails === "all" || m.emails === (emails === "on")) &&
        (discord === "all" || m.discordState === discord),
    );
    const cmp = (a: MemberRow, b: MemberRow) => {
      if (sort.key === "discordState") return DISCORD_ORDER[a.discordState] - DISCORD_ORDER[b.discordState];
      const x = a[sort.key], y = b[sort.key];
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y);
      return Number(x) - Number(y);
    };
    return out.sort((a, b) => sort.dir * cmp(a, b) || a.name.localeCompare(b.name));
  }, [rows, q, status, plan, account, emails, discord, sort]);

  const click = (key: Key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "plan" || key === "account" || key === "status" || key === "affiliate" || key === "discordState" ? 1 : -1 }));
  const sel = "field-input py-1 text-xs";

  return (
    <Section
      id="members"
      letter="M"
      title="Members"
      aside={<span className="nums">{shown.length === rows.length ? rows.length : `${shown.length} of ${rows.length}`}</span>}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <div className="metric-tabs" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={view === "table"} className="metric-tab" onClick={() => setView("table")}>Table</button>
            <button type="button" role="tab" aria-selected={view === "groups"} className="metric-tab" onClick={() => setView("groups")}>Groups</button>
          </div>
          <input id="members-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, suburb" className="field-input py-1 text-xs w-56" />
          <select id="members-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={sel}>
            <option value="all">Any status</option><option value="live">Live</option><option value="paused">Paused</option><option value="none">No access</option>
          </select>
          <select id="members-plan" value={plan} onChange={(e) => setPlan(e.target.value)} className={sel}>
            <option value="all">Any plan</option>{plans.map((p) => <option key={p} value={p}>{p}</option>)}<option value="tipster">Tipster</option>
          </select>
          <select id="members-account" value={account} onChange={(e) => setAccount(e.target.value as typeof account)} className={sel}>
            <option value="all">Any account</option><option value="active">Active</option><option value="cancelled">Cancelled</option><option value="invited">Invited</option><option value="unconfirmed">Unconfirmed</option>
          </select>
          <select id="members-emails" value={emails} onChange={(e) => setEmails(e.target.value as typeof emails)} className={sel}>
            <option value="all">Emails on or off</option><option value="on">Emails on</option><option value="off">Emails off</option>
          </select>
          <select id="members-discord" value={discord} onChange={(e) => setDiscord(e.target.value as typeof discord)} className={sel}>
            <option value="all">Any Discord</option><option value="member">Discord Member role</option><option value="joined">In the server, no role</option><option value="linked">Linked, not in the server</option><option value="none">Not linked</option>
          </select>
        </div>
      }
    >
      {view === "groups" ? (
        <div className="member-groups">
          {CATEGORIES.map((c) => {
            const list = shown.filter((m) => m.category === c.id);
            return (
              <section key={c.id} className="member-group">
                <div className="member-group-head">
                  <h3>{c.label} <span className="nums">{list.length}</span></h3>
                  {c.hint && <span className="text-xs text-ink-soft">{c.hint}</span>}
                </div>
                {list.length === 0 ? (
                  <p className="text-xs text-ink-soft px-4 py-2">Nobody.</p>
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {list.map((m) => (
                      <li key={m.id} className="member-line">
                        <span className="min-w-0">
                          <Link href={`/admin/${m.id}`} className="font-semibold hover:text-blue">{m.name}</Link>
                          {m.name !== m.email && <span className="block text-xs text-ink-soft truncate">{m.email}</span>}
                        </span>
                        <span className="text-xs text-ink-secondary">{m.plan || (m.affiliate ? `via ${m.affiliate}` : m.source)}</span>
                        <span className="text-xs text-ink-soft nums">{c.id === "paying" || c.id === "trial" || c.id === "paused" || c.id === "gift" ? `until ${day(m.accessUntil)}` : `since ${day(m.since)}`}</span>
                        <span className="text-xs text-ink-soft nums">seen {when(m.lastSeen)}</span>
                        <span>{m.discordState === "member" ? <span className="badge badge-prime">Discord</span> : m.discordState === "joined" ? <span className="badge badge-warn">No role</span> : m.discordState === "linked" ? <span className="badge badge-muted">Not joined</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="data-table stack-sm text-sm min-w-[1100px]">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={c.right ? "text-right" : ""} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => click(c.key)} className="font-inherit hover:text-ink">
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={COLS.length + 1} className="text-ink-soft">Nobody matches.</td></tr>
            )}
            {shown.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/admin/${m.id}`} className="font-semibold hover:text-blue">{m.name}</Link>
                  {m.name !== m.email && <span className="block text-xs text-ink-soft">{m.email}</span>}
                  {m.admin && <span className="badge badge-prime ml-2">Admin</span>}
                </td>
                <td data-label="Account">{m.account === "active" ? <span className="badge badge-muted">Active</span> : m.account === "cancelled" ? <span className="badge badge-lay">Cancelled</span> : <span className="badge badge-warn">{m.account === "invited" ? "Invited" : "Unconfirmed"}</span>}</td>
                <td data-label="Plan">{m.tipster ? <span className="badge badge-prime">Tipster</span> : m.plan || "—"}</td>
                <td data-label="Came from">{m.affiliate ? <span className="badge badge-muted nums">{m.affiliate}</span> : <span className="text-xs text-ink-soft">{m.source}</span>}</td>
                <td data-label="Status">{m.status === "paused" ? <span className="badge badge-warn">Paused</span> : m.status === "live" ? <span className="badge badge-prime">{m.statusLabel}</span> : <span className="badge badge-muted">{m.statusLabel}</span>}</td>
                <td data-label="Access until" className="nums">{day(m.accessUntil)}</td>
                <td data-label="Since" className="nums">{day(m.since)}</td>
                <td data-label="Spent" className="text-right nums">{money(m.spent)}</td>
                <td data-label="Passes" className="text-right nums">{m.passes}</td>
                <td data-label="Emails">{m.emails ? <span className="badge badge-prime">On</span> : <span className="badge badge-muted">Off</span>}</td>
                <td data-label="Discord">
                  {m.discordState === "none" ? (
                    <span className="text-xs text-ink-soft">—</span>
                  ) : (
                    <>
                      {m.discordState === "member" ? <span className="badge badge-prime">Member</span> : m.discordState === "joined" ? <span className="badge badge-warn">No role</span> : <span className="badge badge-muted">Not joined</span>}
                      <span className="block text-xs text-ink-soft">{m.discord}</span>
                    </>
                  )}
                </td>
                <td data-label="Last seen" className="nums">{when(m.lastSeen)}</td>
                <td>
                  {m.id !== self && !m.admin && (
                    <form action={remove.bind(null, m.id)}>
                      <ConfirmButton message={`Delete ${m.email || m.name} for good? Their login, profile and passes go with it.`} className="text-xs text-red hover:underline">Delete</ConfirmButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </Section>
  );
}
