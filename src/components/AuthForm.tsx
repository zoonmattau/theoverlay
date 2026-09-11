"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestReset, signIn, signUp, updatePassword, type AuthState } from "@/app/(auth)/actions";

const EMPTY: AuthState = {};

type Mode = "login" | "signup" | "forgot" | "reset";

const ACTIONS = { login: signIn, signup: signUp, forgot: requestReset, reset: updatePassword };
const SUBMIT = { login: "Log in", signup: "Create account", forgot: "Send reset link", reset: "Save new password" };

export function AuthForm({ mode, next, refCode }: { mode: Mode; next?: string; refCode?: string }) {
  const [state, formAction, pending] = useActionState(ACTIONS[mode], EMPTY);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
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

      {state.error && <p className="text-sm text-red font-semibold">{state.error}</p>}
      {state.notice && <p className="text-sm text-accent font-semibold">{state.notice}</p>}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "One moment" : SUBMIT[mode]}
      </button>

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
