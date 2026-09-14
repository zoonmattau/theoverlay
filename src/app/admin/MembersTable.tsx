"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Section } from "@/components/Section";

/** One member as the table needs it: display strings plus raw values to sort on. */
export interface MemberRow {
  id: string;
  name: string;
  email: string;
  /** Everything searchable, lower case: name, email, phone, suburb, code. */
  haystack: string;
  account: "active" | "invited" | "unconfirmed";
  admin: boolean;
  tipster: boolean;
  plan: string;
  status: "live" | "paused" | "none";
  statusLabel: string;
  accessUntil: number;
  since: number;
  spent: number;
  passes: number;
  gift: number;
  emails: boolean;
  lastSeen: number;
}

type Key = "name" | "account" | "plan" | "status" | "accessUntil" | "since" | "spent" | "passes" | "gift" | "emails" | "lastSeen";

const COLS: { key: Key; label: string; right?: boolean }[] = [
  { key: "name", label: "Member" },
  { key: "account", label: "Account" },
  { key: "plan", label: "Plan" },
  { key: "status", label: "Status" },
  { key: "accessUntil", label: "Access until" },
  { key: "since", label: "Since" },
  { key: "spent", label: "Spent", right: true },
  { key: "passes", label: "Passes", right: true },
  { key: "gift", label: "Gift until" },
  { key: "emails", label: "Emails" },
  { key: "lastSeen", label: "Last seen" },
];

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (t: number) => (t ? new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }) : "—");
const when = (t: number) => (t ? new Date(t).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "never");

/** The member list: search as you type, filter by status, plan, account and emails, sort on any column, collapse the lot. */
export function MembersTable({ rows, plans }: { rows: MemberRow[]; plans: string[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "live" | "paused" | "none">("all");
  const [plan, setPlan] = useState("all");
  const [account, setAccount] = useState<"all" | "active" | "invited" | "unconfirmed">("all");
  const [emails, setEmails] = useState<"all" | "on" | "off">("all");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "since", dir: -1 });

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (m) =>
        (!needle || m.haystack.includes(needle)) &&
        (status === "all" || m.status === status) &&
        (plan === "all" || (plan === "tipster" ? m.tipster : m.plan === plan)) &&
        (account === "all" || m.account === account) &&
        (emails === "all" || m.emails === (emails === "on")),
    );
    const cmp = (a: MemberRow, b: MemberRow) => {
      const x = a[sort.key], y = b[sort.key];
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y);
      return Number(x) - Number(y);
    };
    return out.sort((a, b) => sort.dir * cmp(a, b) || a.name.localeCompare(b.name));
  }, [rows, q, status, plan, account, emails, sort]);

  const click = (key: Key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "plan" || key === "account" || key === "status" ? 1 : -1 }));
  const sel = "field-input py-1 text-xs";

  return (
    <Section
      id="members"
      letter="M"
      title="Members"
      aside={<span className="nums">{shown.length === rows.length ? rows.length : `${shown.length} of ${rows.length}`}</span>}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <input id="members-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, suburb" className="field-input py-1 text-xs w-56" />
          <select id="members-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={sel}>
            <option value="all">Any status</option><option value="live">Live</option><option value="paused">Paused</option><option value="none">No access</option>
          </select>
          <select id="members-plan" value={plan} onChange={(e) => setPlan(e.target.value)} className={sel}>
            <option value="all">Any plan</option>{plans.map((p) => <option key={p} value={p}>{p}</option>)}<option value="tipster">Tipster</option>
          </select>
          <select id="members-account" value={account} onChange={(e) => setAccount(e.target.value as typeof account)} className={sel}>
            <option value="all">Any account</option><option value="active">Active</option><option value="invited">Invited</option><option value="unconfirmed">Unconfirmed</option>
          </select>
          <select id="members-emails" value={emails} onChange={(e) => setEmails(e.target.value as typeof emails)} className={sel}>
            <option value="all">Emails on or off</option><option value="on">Emails on</option><option value="off">Emails off</option>
          </select>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="data-table text-sm min-w-[1100px]">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={c.right ? "text-right" : ""} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => click(c.key)} className="font-inherit hover:text-ink">
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={COLS.length} className="text-ink-soft">Nobody matches.</td></tr>
            )}
            {shown.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/admin/${m.id}`} className="font-semibold hover:text-blue">{m.name}</Link>
                  {m.name !== m.email && <span className="block text-xs text-ink-soft">{m.email}</span>}
                  {m.admin && <span className="badge badge-prime ml-2">Admin</span>}
                </td>
                <td>{m.account === "active" ? <span className="badge badge-muted">Active</span> : <span className="badge badge-warn">{m.account === "invited" ? "Invited" : "Unconfirmed"}</span>}</td>
                <td>{m.tipster ? <span className="badge badge-prime">Tipster</span> : m.plan || "—"}</td>
                <td>{m.status === "paused" ? <span className="badge badge-warn">Paused</span> : m.status === "live" ? <span className="badge badge-prime">{m.statusLabel}</span> : <span className="badge badge-muted">{m.statusLabel}</span>}</td>
                <td className="nums">{day(m.accessUntil)}</td>
                <td className="nums">{day(m.since)}</td>
                <td className="text-right nums">{money(m.spent)}</td>
                <td className="text-right nums">{m.passes}</td>
                <td className="nums">{day(m.gift)}</td>
                <td>{m.emails ? <span className="badge badge-prime">On</span> : <span className="badge badge-muted">Off</span>}</td>
                <td className="nums">{when(m.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
