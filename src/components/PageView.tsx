"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** The id for this tab, so a browser that refuses the cookie is still one person page to page. */
let tabVid = "";

/**
 * A visitor id that survives sign-out, so anonymous views string together.
 * The cookie first, then local storage, then this tab's memory: Facebook and
 * Instagram's in-app browsers and private windows can refuse the cookie, and
 * every page then read as a new person (12 Oct 2026: one visit to /, /tips
 * and /tipsters counted as three).
 */
function visitorId(): string {
  try {
    const fromCookie = document.cookie.match(/(?:^|; )ov_vid=([^;]+)/)?.[1];
    let fromStore = "";
    try {
      fromStore = localStorage.getItem("ov_vid") ?? "";
    } catch {
      // storage blocked too
    }
    const id = fromCookie || fromStore || tabVid || crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    tabVid = id;
    if (!fromCookie) document.cookie = `ov_vid=${id}; max-age=${400 * 86400}; path=/; samesite=lax`;
    if (!fromStore) {
      try {
        localStorage.setItem("ov_vid", id);
      } catch {
        // storage blocked: the tab's memory still holds it
      }
    }
    return id;
  } catch {
    return tabVid;
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
    // The campaign a link carried, and whose ad was clicked: the address loses both after the first page.
    const q = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries(["source", "medium", "campaign", "content", "term"].map((k) => [k, q.get(`utm_${k}`)]).filter(([, v]) => v));
    const clid = q.has("fbclid") ? "fb" : q.has("gclid") || q.has("gbraid") || q.has("wbraid") ? "google" : q.has("ttclid") ? "tiktok" : q.has("msclkid") ? "microsoft" : undefined;
    const body = JSON.stringify({
      kind: "page_view",
      path,
      vid: visitorId(),
      referrer: document.referrer ? new URL(document.referrer).host : undefined,
      ...(Object.keys(utm).length ? { utm } : {}),
      ...(clid ? { clid } : {}),
    });
    const send = () => {
      try {
        if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
          fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
        }
      } catch {
        // a lost view is not an error
      }
    };
    // Chrome loads the top Google results before anyone clicks; a page loaded that way counts only
    // once it is shown (12 Oct 2026: seven "visitors" from Google in 50 seconds, one page each).
    const doc = document as Document & { prerendering?: boolean };
    if (doc.prerendering) {
      doc.addEventListener("prerenderingchange", send, { once: true });
      return () => doc.removeEventListener("prerenderingchange", send);
    }
    send();
  }, [path]);
  return null;
}
