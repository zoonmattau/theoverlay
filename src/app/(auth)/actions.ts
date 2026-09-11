"use server";

import { redirect } from "next/navigation";

import { applyReferral } from "@/lib/referrals";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  notice?: string;
}

/** Where to send someone after they sign in. Only ever a local path. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "Accounts are not set up yet." };
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Email and password, please." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password did not match." };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "Accounts are not set up yet." };
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || password.length < 8) return { error: "A valid email and a password of at least 8 characters." };
  if (form.get("age") !== "on") return { error: "You need to be 18 or over." };
  if (form.get("privacy") !== "on") return { error: "Please accept the terms and privacy policy." };
  const marketing = form.get("marketing") === "on";
  const ref = String(form.get("ref") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || undefined;

  const supabase = await supabaseServer();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}`,
      // Copied onto the profile by the database trigger, and read back at confirmation.
      data: { accepted_terms: "true", marketing_opt_in: marketing, ...(ref ? { ref } : {}) },
    },
  });
  if (error) return { error: error.message };
  // Email confirmation off: signed in already. On: they need the link.
  if (data.session) {
    if (ref && data.user) await applyReferral(data.user.id, ref);
    const next = safeNext(form.get("next"));
    redirect(`${next}${next.includes("?") ? "&" : "?"}registered=1`);
  }
  return { notice: "Check your email for a link to confirm your account." };
}

export async function requestReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "Accounts are not set up yet." };
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Your email, please." };
  const supabase = await supabaseServer();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${site}/auth/callback?next=${encodeURIComponent("/reset")}`,
  });
  // Same answer whether or not the address exists, so nobody can probe for accounts.
  return { notice: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "Accounts are not set up yet." };
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "At least 8 characters, please." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "That link has expired, request a new one." };
  redirect("/account?password=updated");
}

export async function signOut() {
  if (supabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  redirect("/");
}
