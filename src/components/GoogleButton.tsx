"use client";

import { useEffect, useRef, useState } from "react";

import { signInWithGoogleToken } from "@/app/(auth)/actions";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (r: { credential: string }) => void; nonce?: string; ux_mode?: "popup"; use_fedcm_for_prompt?: boolean }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

/** A random nonce for Google, and its SHA-256 for the token, as Supabase expects. */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}

/**
 * Google's own sign-in button, on our domain. It hands back an ID token,
 * which the server action swaps for a session; Google's consent screen
 * therefore names The Overlay, not the Supabase host the redirect flow
 * goes through. Reads the sign-up boxes off the surrounding form.
 */
export function GoogleButton({ clientId, mode, next, refCode }: { clientId: string; mode: "login" | "signup"; next: string; refCode?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ready = () => {
      if (cancelled || !host.current || !window.google) return;
      makeNonce().then(({ raw, hashed }) => {
        if (cancelled || !host.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce: hashed,
          ux_mode: "popup",
          use_fedcm_for_prompt: false,
          callback: async ({ credential }) => {
            const form = host.current?.closest("form");
            const on = (name: string) => (form?.elements.namedItem(name) as HTMLInputElement | null)?.checked ?? false;
            const val = (name: string) => (form?.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "";
            setBusy(true);
            setError(undefined);
            const r = await signInWithGoogleToken({
              credential,
              nonce: raw,
              mode,
              age: on("age"),
              privacy: on("privacy"),
              marketing: on("marketing"),
              aff: val("aff"),
              ref: refCode ?? val("ref"),
              next,
            });
            // A successful sign-in redirects and never returns.
            setBusy(false);
            if (r?.error) setError(r.error);
          },
        });
        host.current.innerHTML = "";
        window.google.accounts.id.renderButton(host.current, { theme: "outline", size: "large", shape: "pill", text: mode === "signup" ? "signup_with" : "signin_with", width: host.current.offsetWidth || 320, logo_alignment: "center" });
      });
    };
    if (window.google?.accounts?.id) ready();
    else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = ready;
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
    };
  }, [clientId, mode, next, refCode]);

  return (
    <div className="space-y-2">
      <div ref={host} className={`flex justify-center min-h-11 ${busy ? "opacity-50 pointer-events-none" : ""}`} aria-busy={busy} />
      {error && <p className="text-sm text-red font-semibold">{error}</p>}
    </div>
  );
}
