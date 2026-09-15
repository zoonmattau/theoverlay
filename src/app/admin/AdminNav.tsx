"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/money", label: "Money" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/affiliates", label: "Affiliates and tipsters" },
];

/** The admin menu down the left; a member page lights up Members. */
export function AdminNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href) || (href === "/admin/members" && /^\/admin\/[0-9a-f-]{36}$/.test(path)));
  return (
    <nav className="admin-nav" aria-label="Admin">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={`admin-nav-link ${active(i.href) ? "is-active" : ""}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
