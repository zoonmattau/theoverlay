"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/data/horses", label: "Horses" },
  { href: "/data/jockeys", label: "Jockeys" },
  { href: "/data/trainers", label: "Trainers" },
  { href: "/data/combos", label: "Combos" },
  { href: "/data/tracks", label: "Tracks" },
  { href: "/data/distances", label: "Distances" },
  { href: "/data/goings", label: "Goings" },
];

export function HubNav() {
  const path = usePathname();
  return (
    <div className="tabs mt-4" role="tablist">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="tab" role="tab" aria-selected={path === t.href || path.startsWith(`${t.href}/`)}>{t.label}</Link>
      ))}
    </div>
  );
}
