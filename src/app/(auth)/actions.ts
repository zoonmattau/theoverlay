"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AFF_COOKIE, attributeSignup, codeFromInput } from "@/lib/affiliates";
import { OAUTH_COOKIE, PROVIDERS, type Provider } from "@/lib/social";

import { supabaseAdmin } from "@/lib/billing/access";
import { EMAILS } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";
import { applyReferral } from "@/lib/referrals";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

/**
 * Auth emails go out through Resend from our own domain: Supabase makes the
 * one-time token, we build the /auth/confirm link and send the message, so
 * nothing depends on Supabase's SMTP or its templates.
 */
const ownEmails = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.RESEND_API_KEY);
const confirmLink = (site: string, token: string, type: string, next: string) =>
  `${site}/auth/confirm?token_hash=${token}&type=${type}&next=${encodeURIComponent(next)}`;

export interface AuthState {
  error?: string;
  notice?: string;
}

/** Where to send someone after they sign in. Only ever a local path. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/**
 * Continue with Google or X, from the log in or sign up form. On sign up
 * the age and terms boxes have to be ticked first; the affiliate code,
 * invite code and email choice ride along in a short cookie so the
 * callback can stamp them on the account the provider creates.
 */
export async function signInWithProvider(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "Accounts are not set up yet." };
  const provider = String(form.get("provider") ?? "") as Provider;
  if (!(provider in PROVIDERS)) return { error: "Pick Google or X." };
  const signup = form.get("mode") === "signup";
  if (signup && form.get("age") !== "on") return { error: "You need to be 18 or over." };
  if (signup && form.get("privacy") !== "on") return { error: "Please accept the terms and privacy policy." };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const jar = await cookies();
  const aff = codeFromInput(String(form.get("aff") ?? "")) || jar.get(AFF_COOKIE)?.value || "";
  const ref = String(form.get("ref") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const wanted = safeNext(form.get("next"));
  const next = wanted === "/" && aff ? "/pricing" : wanted;
  if (signup) {
    const stash = { terms: true, marketing: form.get("marketing") === "on", aff, ref, provider };
    jar.set(OAUTH_COOKIE, JSON.stringify(stash), { maxAge: 600, path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`, ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}) },
  });
  if (error || !data.url) return { error: error?.message ?? `${PROVIDERS[provider]} is not available right now.` };
  redirect(data.url);
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
  const fullName = String(form.get("name") ?? "").trim().slice(0, 120);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // The affiliate field wins over the cookie an earlier click left behind.
  const aff = codeFromInput(String(form.get("aff") ?? "")) || (await cookies()).get(AFF_COOKIE)?.value;
  // Someone an affiliate sent lands on the plans once their email is confirmed.
  const wanted = safeNext(form.get("next"));
  const next = wanted === "/" && aff ? "/pricing" : wanted;
  const meta = { accepted_terms: "true", marketing_opt_in: marketing, full_name: fullName, source: ref ? "invite" : aff ? `affiliate:${aff}` : "signup", ...(ref ? { ref } : {}) };

  if (ownEmails()) {
    const { data, error } = await supabaseAdmin().auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { data: meta, redirectTo: `${site}/auth/confirm` },
    });
    if (error) {
      return { error: /already|exists|registered/i.test(error.message) ? "That email already has an account, log in instead." : error.message };
    }
    if (data.user) await attributeSignup(data.user.id, aff);
    const ok = await sendEmail(email, EMAILS.confirmSignup(confirmLink(site, data.properties.hashed_token, "signup", next)));
    return ok ? { notice: "Check your email for a link to confirm your account." } : { error: "We could not send the confirmation email, try again in a minute." };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`,
      // Copied onto the profile by the database trigger, and read back at confirmation.
      data: meta,
    },
  });
  if (error) return { error: error.message };
  if (data.user) await attributeSignup(data.user.id, aff);
  // Email confirmation off: signed in already. On: they need the link.
  if (data.session) {
    if (ref && data.user) await applyReferral(data.user.id, ref);
    redirect(`${next}${next.includes("?") ? "&" : "?"}registered=1`);
  }
  return { notice: "Check your email for a link to confirm your account." };
}

export async function requestReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "Accounts are not set up yet." };
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Your email, please." };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (ownEmails()) {
    const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${site}/auth/confirm` } });
    if (!error && data.properties) await sendEmail(email, EMAILS.resetPassword(confirmLink(site, data.properties.hashed_token, "recovery", "/reset")));
  } else {
    const supabase = await supabaseServer();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${site}/auth/callback?next=${encodeURIComponent("/reset")}`,
    });
  }
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
