"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Starts Stripe Checkout for a plan, or sends a signed-out visitor to sign up. */
export function CheckoutButton({
  plan,
  passes,
  signedIn,
  label,
  className = "btn btn-primary w-full",
}: {
  plan?: string;
  passes?: number;
  signedIn: boolean;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!signedIn) {
      router.push(`/signup?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(plan ? { plan } : { passes }),
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
