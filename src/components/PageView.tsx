"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** A visitor id that survives sign-out, so anonymous views string together. */
function visitorId(): string {
  try {
    const m = document.cookie.match(/(?:^|; )ov_vid=([^;]+)/);
    if (m) return m[1];
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    document.cookie = `ov_vid=${id}; max-age=${400 * 86400}; path=/; samesite=lax`;
    return id;
  } catch {
    return "";
  }
}

/** Records each page a person lands on, once per path per visit, for the admin activity page. */
export function PageView() {
  const path = usePathname();
  const last = useRef<{ path: string; at: number }>({ path: "", at: 0 });
  useEffect(() => {
    if (!path || path.startsWith("/admin") || path.startsWith("/api")) return;
    // A driven browser is not a visitor. Screenshot and test runs used to land
    // in the activity as a new person each time, since every run starts with a
    // fresh cookie and so a fresh visitor id.
    if (navigator.webdriver) return;
    const now = Date.now();
    if (last.current.path === path && now - last.current.at < 30_000) return;
    last.current = { path, at: now };
    const body = JSON.stringify({ kind: "page_view", path, vid: visitorId(), referrer: document.referrer ? new URL(document.referrer).host : undefined });
    try {
      if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
        fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch {
      // a lost view is not an error
    }
  }, [path]);
  return null;
}
