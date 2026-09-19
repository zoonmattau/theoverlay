"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The admin menu in four banners: the day, the racing, the people, the money. */
const GROUPS: { title: string; items: { href: string; label: string; hint?: string }[] }[] = [
  { title: "Today", items: [{ href: "/admin", label: "Overview", hint: "the day at a glance" }] },
  {
    title: "Racing",
    items: [
      { href: "/tips", label: "Today's card", hint: "every call, as members see it" },
      { href: "/admin/review", label: "Weekly review", hint: "how the runs went against our marks" },
      { href: "/admin/reports", label: "Record", hint: "units over time, the model and the tipsters" },
      { href: "/admin/lays", label: "Never lay", hint: "horses ruled out of the lays" },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/admin/members", label: "Members", hint: "every account" },
      { href: "/admin/activity", label: "Activity", hint: "where they go on the site" },
      { href: "/admin/affiliates", label: "Tipsters and affiliates", hint: "who sends people, who posts calls" },
    ],
  },
  { title: "Money", items: [{ href: "/admin/money", label: "Money", hint: "funnel, plans, revenue" }] },
];

export function AdminNav() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/admin" ? path === "/admin" : href === "/tips" ? false : path.startsWith(href) || (href === "/admin/members" && /^\/admin\/[0-9a-f-]{36}$/.test(path));
  return (
    <nav className="admin-nav" aria-label="Admin">
      {GROUPS.map((g) => (
        <div key={g.title} className="mb-3 flex flex-col gap-0.5">
          <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.12em] font-bold text-ink-soft">{g.title}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className={`admin-nav-link block ${active(i.href) ? "is-active" : ""}`} title={i.hint}>
              {i.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
