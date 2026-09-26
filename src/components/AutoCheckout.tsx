"use client";

import { useEffect, useState } from "react";

import { track } from "@/components/MetaPixel";

/**
 * Someone picked a plan or a pass before they had an account. Now that they
 * are signed in, open Stripe for that choice straight away rather than
 * asking them to click it again.
 */
export function AutoCheckout({ buy }: { buy: string }) {
  const [error, setError] = useState<string | null>(null);
  const passes = buy.match(/^passes_(\d+)$/)?.[1];
  // A plan comes as everyday, or everyday_year when they chose a longer term.
  const [plan, term = "month"] = buy.split("_");
  const label = passes ? (passes === "1" ? "your day pass" : `${passes} day passes`) : `the ${plan} plan`;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      track("InitiateCheckout", { content_name: buy });
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(passes ? { passes: Number(passes) } : { plan, term }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (cancelled) return;
      if (data.url) window.location.href = data.url;
      else setError(data.error ?? "Something went wrong, pick it again below.");
    })();
    return () => {
      cancelled = true;
    };
  }, [buy, passes, plan, term]);
  return (
    <div className="card border-lime bg-lime-soft mb-6 text-sm">
      {error ? <p className="font-semibold text-red">{error}</p> : <p className="font-semibold">Account made. Opening checkout for {label}…</p>}
    </div>
  );
}
