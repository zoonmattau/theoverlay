"use client";

import { useState } from "react";

/** Opens Stripe's Customer Portal for the signed-in subscriber. */
export function PortalButton() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { url?: string };
    if (data.url) window.location.href = data.url;
    else setBusy(false);
  }
  return (
    <button type="button" className="btn btn-secondary" onClick={go} disabled={busy}>
      {busy ? "Opening" : "Manage subscription"}
    </button>
  );
}
