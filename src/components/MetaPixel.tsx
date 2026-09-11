"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/** Fires a standard Meta event if the pixel is loaded, otherwise does nothing. */
export function track(event: string, params?: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.fbq) window.fbq("track", event, params);
}

/**
 * Meta Pixel: PageView on every route, and the conversion events Meta ads
 * optimise on, read off the URL the site lands people on after each step.
 * Nothing loads without NEXT_PUBLIC_META_PIXEL_ID.
 */
export function MetaPixel() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (!PIXEL || !window.fbq) return;
    window.fbq("track", "PageView");
    const checkout = search.get("checkout");
    const value = Number(search.get("amount") ?? 0);
    const plan = search.get("plan") ?? undefined;
    if (search.get("registered") === "1") track("CompleteRegistration", { content_name: "account" });
    if (checkout === "success") {
      if (search.get("trial") === "1") track("StartTrial", { value, currency: "AUD", predicted_ltv: value * 3, content_name: plan });
      track("Subscribe", { value, currency: "AUD", predicted_ltv: value * 3, content_name: plan });
    }
    if (checkout === "passes") track("Purchase", { value, currency: "AUD", content_name: "day passes", content_type: "product" });
  }, [pathname, search]);

  if (!PIXEL) return null;
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL}');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: "none" }} alt="" src={`https://www.facebook.com/tr?id=${PIXEL}&ev=PageView&noscript=1`} />
      </noscript>
    </>
  );
}
