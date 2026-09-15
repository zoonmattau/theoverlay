"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestReset, signIn, signInWithProvider, signUp, updatePassword, type AuthState, type Provider } from "@/app/(auth)/actions";

const EMPTY: AuthState = {};

type Mode = "login" | "signup" | "forgot" | "reset";

const ACTIONS = { login: signIn, signup: signUp, forgot: requestReset, reset: updatePassword };
const SUBMIT = { login: "Log in", signup: "Create account", forgot: "Send reset link", reset: "Save new password" };

/** Google's G, so the button reads as theirs. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.5 2.9-2.2 5.4-4.7 7.1l7.3 5.7c4.3-4 6.8-9.8 6.8-16.8z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C1 16.4 0 20.1 0 24s1 7.6 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.3-5.7c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** The X logo, in ink. */
function XMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M18.2 2h3.4l-7.4 8.5L23 22h-6.8l-5.3-7-6.1 7H1.4l7.9-9.1L1 2h7l4.8 6.4L18.2 2zm-1.2 18h1.9L7.1 3.9H5.1L17 20z" />
    </svg>
  );
}

export function AuthForm({ mode, next, refCode, affCode, providers = [] }: { mode: Mode; next?: string; refCode?: string; affCode?: string; providers?: Provider[] }) {
  const [state, formAction, pending] = useActionState(ACTIONS[mode], EMPTY);
  const [pstate, providerAction, ppending] = useActionState(signInWithProvider, EMPTY);
  const social = mode === "login" || mode === "signup" ? providers : [];
  const busy = pending || ppending;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <input type="hidden" name="mode" value={mode} />
      {refCode && <input type="hidden" name="ref" value={refCode} />}

      {mode === "signup" && (
        <label className="field">
          <span>Name</span>
          <input name="name" type="text" autoComplete="name" required placeholder="Your name" />
        </label>
      )}

      {mode !== "reset" && (
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </label>
      )}

      {mode !== "forgot" && (
        <label className="field">
          <span>{mode === "reset" ? "New password" : "Password"}</span>
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "login" ? undefined : 8}
            placeholder={mode === "login" ? "" : "At least 8 characters"}
          />
        </label>
      )}

      {mode === "login" && (
        <p className="text-right -mt-2">
          <Link href="/forgot" className="text-xs text-ink-soft hover:text-ink">
            Forgot your password?
          </Link>
        </p>
      )}

      {mode === "signup" && !refCode && (
        <label className="field">
          <span>Affiliate link</span>
          <input name="aff" type="text" autoComplete="off" defaultValue={affCode ?? ""} placeholder="The link or code someone sent you, if any" />
        </label>
      )}

      {mode === "signup" && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-ink-secondary">
            <input name="age" type="checkbox" className="mt-1" required />
            <span>I am 18 or over.</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-secondary">
            <input name="privacy" type="checkbox" className="mt-1" required />
            <span>
              I agree to the{" "}
              <Link href="/terms" className="text-blue underline underline-offset-2">terms</Link> and{" "}
              <Link href="/privacy" className="text-blue underline underline-offset-2">privacy policy</Link>.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-secondary">
            <input name="marketing" type="checkbox" className="mt-1" defaultChecked />
            <span>Send me tips, offers and updates by email and notification, unsubscribe any time.</span>
          </label>
        </div>
      )}

      {(state.error || pstate.error) && <p className="text-sm text-red font-semibold">{state.error ?? pstate.error}</p>}
      {state.notice && <p className="text-sm text-accent font-semibold">{state.notice}</p>}

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {pending ? "One moment" : SUBMIT[mode]}
      </button>

      {social.length > 0 && (
        <>
          <div className="flex items-center gap-3 text-xs text-ink-soft" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          {social.includes("google") && (
            <button type="submit" name="provider" value="google" formAction={providerAction} className="btn btn-secondary w-full" disabled={busy}>
              <GoogleMark />
              {ppending ? "One moment" : "Continue with Google"}
            </button>
          )}
          {social.includes("twitter") && (
            <button type="submit" name="provider" value="twitter" formAction={providerAction} className="btn btn-secondary w-full" disabled={busy}>
              <XMark />
              {ppending ? "One moment" : "Continue with X"}
            </button>
          )}
          {mode === "signup" && <p className="text-xs text-ink-soft text-center -mt-1">Tick the boxes above first, they apply either way.</p>}
        </>
      )}

      <p className="text-sm text-ink-soft text-center">
        {mode === "forgot" || mode === "reset" ? (
          <Link href="/login" className="text-blue font-semibold">
            Back to log in
          </Link>
        ) : mode === "login" ? (
          <>
            New here?{" "}
            <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-blue font-semibold">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have one?{" "}
            <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-blue font-semibold">
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
