"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { track } from "@/components/MetaPixel";

/** Starts Stripe Checkout for a plan, or sends a signed-out visitor to sign up. */
export function CheckoutButton({
  plan,
  term = "month",
  passes,
  signedIn,
  label,
  className = "btn btn-primary w-full",
}: {
  plan?: string;
  /** month, quarter or year; monthly unless said. */
  term?: string;
  passes?: number;
  signedIn: boolean;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // everyday, or everyday_year for a longer term: what the funnel records and what survives a sign-up.
  const choice = plan ? (term === "month" ? plan : `${plan}_${term}`) : `passes_${passes}`;

  async function go() {
    if (!signedIn) {
      fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "plan_click", plan: choice }),
        keepalive: true,
      }).catch(() => {});
      // Come back to pricing with the choice remembered, so checkout opens on its own.
      router.push(`/signup?next=${encodeURIComponent(`/pricing?buy=${choice}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    track("InitiateCheckout", { content_name: choice });
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(plan ? { plan, term } : { passes }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    setError(data.error ?? "Something went wrong.");
    setBusy(false);
  }

  return (
    <div>
      <button type="button" className={className} onClick={go} disabled={busy}>
        {busy ? "Opening checkout" : label}
      </button>
      {error && <p className="mt-2 text-xs text-red font-semibold">{error}</p>}
    </div>
  );
}
