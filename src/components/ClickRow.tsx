"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** A table row that opens a page when clicked, so a race or a tipster is one click wherever the row is hit; a link or button inside it keeps its own job. */
export function ClickRow({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className={`cursor-pointer hover:bg-line-soft ${className}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, form")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
