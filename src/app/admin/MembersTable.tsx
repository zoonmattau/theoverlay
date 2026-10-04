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
  /** Monthly, Quarterly or Yearly while a plan is live, else "". */
  term: string;
  /** The affiliate code they signed up through, or "" for none. */
  affiliate: string;
  /** signup, invite, google or affiliate. */
  source: string;
  /** Where they found us: Meta ads, Instagram, Search, Affiliate and so on. */
  found: string;
  /** The campaign, affiliate code or site behind it, or "". */
  foundDetail: string;
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
  /** live: a key that works; revoked: had one, none live now; none: never made one. */
  api: "live" | "revoked" | "none";
  /** Calls made on every key they have had. */
  apiUses: number;
  apiLastUsed: number;
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

type Key = "name" | "account" | "plan" | "found" | "status" | "accessUntil" | "since" | "spent" | "passes" | "emails" | "lastSeen" | "discordState" | "api";

const COLS: { key: Key; label: string; right?: boolean }[] = [
  { key: "name", label: "Member" },
  { key: "account", label: "Account" },
  { key: "plan", label: "Plan" },
  { key: "found", label: "Found us" },
  { key: "status", label: "Status" },
  { key: "accessUntil", label: "Access until" },
  { key: "since", label: "Since" },
  { key: "spent", label: "Spent", right: true },
  { key: "passes", label: "Passes", right: true },
  { key: "emails", label: "Emails" },
  { key: "discordState", label: "Discord" },
  { key: "api", label: "API" },
  { key: "lastSeen", label: "Last seen" },
];
const DISCORD_ORDER = { member: 0, joined: 1, linked: 2, none: 3 };
const API_ORDER = { live: 0, revoked: 1, none: 2 };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (t: number) => (t ? new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }) : "—");
const when = (t: number) => (t ? new Date(t).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "never");

/** The member list: search as you type, filter by status, plan, account and emails, sort on any column, collapse the lot. */
export function MembersTable({ rows, plans, found: foundGroups, remove, self }: { rows: MemberRow[]; plans: string[]; found: string[]; remove: (id: string) => Promise<void>; self?: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "live" | "paused" | "none">("all");
  const [plan, setPlan] = useState("all");
  const [account, setAccount] = useState<"all" | "active" | "cancelled" | "invited" | "unconfirmed">("all");
  const [emails, setEmails] = useState<"all" | "on" | "off">("all");
  const [discord, setDiscord] = useState<"all" | MemberRow["discordState"]>("all");
  const [api, setApi] = useState<"all" | MemberRow["api"]>("all");
  const [found, setFound] = useState("all");
  const [term, setTerm] = useState("all");
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
        (discord === "all" || m.discordState === discord) &&
        (api === "all" || m.api === api) &&
        (found === "all" || m.found === found) &&
        (term === "all" || m.term === term),
    );
    const cmp = (a: MemberRow, b: MemberRow) => {
      if (sort.key === "discordState") return DISCORD_ORDER[a.discordState] - DISCORD_ORDER[b.discordState];
      if (sort.key === "api") return API_ORDER[a.api] - API_ORDER[b.api] || b.apiUses - a.apiUses;
      const x = a[sort.key], y = b[sort.key];
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y);
      return Number(x) - Number(y);
    };
    return out.sort((a, b) => sort.dir * cmp(a, b) || a.name.localeCompare(b.name));
  }, [rows, q, status, plan, account, emails, discord, api, found, term, sort]);

  const active = [status, plan, account, emails, discord, api, found, term].filter((v) => v !== "all").length + (q.trim() ? 1 : 0);
  const clear = () => {
    setQ(""); setStatus("all"); setPlan("all"); setAccount("all"); setEmails("all"); setDiscord("all"); setApi("all"); setFound("all"); setTerm("all");
  };
  const click = (key: Key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "plan" || key === "account" || key === "status" || key === "found" || key === "discordState" || key === "api" ? 1 : -1 }));

  return (
    <Section
      id="members"
      letter="M"
      title="Members"
      aside={<span className="nums">{shown.length === rows.length ? rows.length : `${shown.length} of ${rows.length}`}</span>}
      controls={
        <div className="metric-tabs" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === "table"} className="metric-tab" onClick={() => setView("table")}>Table</button>
          <button type="button" role="tab" aria-selected={view === "groups"} className="metric-tab" onClick={() => setView("groups")}>Groups</button>
        </div>
      }
    >
      <div className="member-filters">
        <input id="members-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, suburb, code" className="field-input member-search" />
        <div className="member-pills">
          <Pill id="members-status" label="Status" value={status} set={(v) => setStatus(v as typeof status)} options={[["live", "Live"], ["paused", "Paused"], ["none", "No access"]]} />
          <Pill id="members-plan" label="Plan" value={plan} set={setPlan} options={[...plans.map((p) => [p, p] as [string, string]), ["tipster", "Tipster"]]} />
          <Pill id="members-term" label="Billing" value={term} set={setTerm} options={["Monthly", "Quarterly", "Yearly"].map((t) => [t, `${t} (${rows.filter((r) => r.term === t).length})`] as [string, string])} />
          <Pill id="members-found" label="Found us" value={found} set={setFound} options={foundGroups.map((g) => [g, `${g} (${rows.filter((r) => r.found === g).length})`] as [string, string])} />
          <Pill id="members-account" label="Account" value={account} set={(v) => setAccount(v as typeof account)} options={[["active", "Active"], ["cancelled", "Cancelled"], ["invited", "Invited"], ["unconfirmed", "Unconfirmed"]]} />
          <Pill id="members-emails" label="Emails" value={emails} set={(v) => setEmails(v as typeof emails)} options={[["on", "On"], ["off", "Off"]]} />
          <Pill id="members-discord" label="Discord" value={discord} set={(v) => setDiscord(v as typeof discord)} options={[["member", "Member role"], ["joined", "In server, no role"], ["linked", "Linked, not in server"], ["none", "Not linked"]]} />
          <Pill id="members-api" label="API" value={api} set={(v) => setApi(v as typeof api)} options={[["live", "Key live"], ["revoked", "Revoked"], ["none", "No key"]]} />
          {active > 0 && (
            <button type="button" className="member-clear" onClick={clear}>Clear {active === 1 ? "filter" : `${active} filters`}</button>
          )}
        </div>
      </div>
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
                        <span className="text-xs text-ink-secondary">{m.plan ? `${m.plan}${m.term ? ` ${m.term.toLowerCase()}` : ""}, ${m.found}` : m.found}</span>
                        <span className="text-xs text-ink-soft nums">{c.id === "paying" || c.id === "trial" || c.id === "paused" || c.id === "gift" ? `until ${day(m.accessUntil)}` : `since ${day(m.since)}`}</span>
                        <span className="text-xs text-ink-soft nums">seen {when(m.lastSeen)}</span>
                        <span>{m.discordState === "member" ? <span className="badge badge-prime">Discord</span> : m.discordState === "joined" ? <span className="badge badge-warn">No role</span> : m.discordState === "linked" ? <span className="badge badge-muted">Not joined</span> : null}{m.api === "live" && <span className="badge badge-muted ml-1">API</span>}</span>
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
        {/* One line a member: second details sit beside the first, small, and rows are tight. */}
        <table className="data-table stack-sm text-xs min-w-[1180px] [&_td]:py-1 [&_th]:py-1.5">
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
                <td className="max-w-[18rem] truncate" title={m.email}>
                  <Link href={`/admin/${m.id}`} className="font-semibold hover:text-blue">{m.name}</Link>
                  {m.name !== m.email && <span className="text-ink-soft"> · {m.email}</span>}
                  {m.admin && <span className="badge badge-prime ml-2">Admin</span>}
                </td>
                <td data-label="Account">{m.account === "active" ? <span className="badge badge-muted">Active</span> : m.account === "cancelled" ? <span className="text-xs font-semibold text-amber" title="Booked to cancel; access runs to the end of what they paid for">Cancelling</span> : <span className="badge badge-warn">{m.account === "invited" ? "Invited" : "Unconfirmed"}</span>}</td>
                <td data-label="Plan">
                  {m.tipster ? <span className="badge badge-prime">Tipster</span> : m.plan || "—"}
                  {m.term && <span className="text-ink-soft"> · {m.term}</span>}
                </td>
                <td data-label="Found us" className="max-w-[14rem] truncate" title={m.foundDetail ? `${m.found}: ${m.foundDetail}` : m.found}>
                  {m.found}
                  {m.foundDetail && <span className="text-ink-soft"> · {m.foundDetail}</span>}
                </td>
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
                <td data-label="API">
                  {m.api === "none" ? (
                    <span className="text-xs text-ink-soft">—</span>
                  ) : (
                    <>
                      {m.api === "live" ? <span className="badge badge-prime">Key</span> : <span className="badge badge-muted">Revoked</span>}
                      <span className="block text-xs text-ink-soft nums">{m.apiUses} {m.apiUses === 1 ? "call" : "calls"}{m.apiLastUsed ? `, ${when(m.apiLastUsed)}` : ""}</span>
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

/** One filter as a pill: its name, then what it is set to. Lime once it narrows the list. */
function Pill({ id, label, value, set, options }: { id: string; label: string; value: string; set: (v: string) => void; options: [string, string][] }) {
  return (
    <label className={`member-pill ${value !== "all" ? "is-on" : ""}`} htmlFor={id}>
      <span className="member-pill-label">{label}</span>
      <select id={id} value={value} onChange={(e) => set(e.target.value)}>
        <option value="all">Any</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
