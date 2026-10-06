import "server-only";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";

import { ARRIVAL_COOKIE, parseArrival } from "@/lib/arrival";
import { supabaseAdmin } from "@/lib/billing/access";

/**
 * Meta's Conversions API: our server tells Meta about a sign-up, a trial or a
 * payment, so the ads optimise on every one instead of the half the browser
 * pixel sees (8 sign-ups from Meta ads, the pixel counted 4, Sep 2026). The
 * pixel loses a sign-up confirmed from an email app's browser, every Google
 * sign-up, and every bill paid days after a trial, which no browser sees.
 *
 * What ties an event to the ad click is kept on the profile at sign-up
 * (meta_match): Meta's _fbp and _fbc cookies, the IP and the browser, read
 * from the request that made the account. Events later, from Stripe's
 * webhook, send that with the hashed email and user id.
 *
 * Needs META_CAPI_TOKEN (Events Manager, the pixel's settings, Conversions
 * API, generate access token) and NEXT_PUBLIC_META_PIXEL_ID. Without them
 * nothing is sent. Never throws: an ad signal is not worth a failed sign-up.
 */

export interface MetaMatch {
  fbp?: string;
  fbc?: string;
  ip?: string;
  ua?: string;
  /** Events sent once per account (registration, trial), by name, ISO time. */
  sent?: Record<string, string>;
}

export type MetaEvent = "CompleteRegistration" | "StartTrial" | "Subscribe" | "Purchase";

const VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";

function configured(): boolean {
  return Boolean(process.env.META_CAPI_TOKEN && process.env.NEXT_PUBLIC_META_PIXEL_ID);
}

const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

/**
 * The click this request carries: the pixel's own cookies, else an _fbc built
 * from the fbclid on the first page they landed on, plus the IP and browser.
 */
export async function matchFromRequest(): Promise<MetaMatch> {
  try {
    const jar = await cookies();
    const h = await headers();
    const fbp = jar.get("_fbp")?.value;
    let fbc = jar.get("_fbc")?.value;
    if (!fbc) {
      const arrival = parseArrival(jar.get(ARRIVAL_COOKIE)?.value);
      const clid = arrival ? new URLSearchParams(arrival.landing.split("?")[1] ?? "").get("fbclid") : null;
      if (arrival && clid) fbc = `fb.1.${new Date(arrival.at).getTime()}.${clid}`;
    }
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
    const ua = h.get("user-agent") ?? undefined;
    return { fbp, fbc, ip, ua };
  } catch {
    return {};
  }
}

/** Keeps the click on a new account, for the events that come later without a browser. */
export async function saveMatch(userId: string, match: MetaMatch): Promise<void> {
  if (!match.fbp && !match.fbc && !match.ip) return;
  const { error } = await supabaseAdmin().from("profiles").update({ meta_match: match }).eq("id", userId).is("meta_match", null);
  if (error) console.error("[meta-capi] save", error.message);
}

/**
 * Sends one event. `once` sends it at most once per account (a registration,
 * a trial), recorded in meta_match.sent; `eventId` lets Meta drop a retry of
 * the same event (a Stripe invoice id). Registration needs a kept click, so a
 * magic-link log-in by an old member never counts as a new sign-up.
 */
export async function sendMetaEvent(
  name: MetaEvent,
  userId: string,
  opts: { eventId?: string; once?: boolean; value?: number; plan?: string; path?: string; requireMatch?: boolean } = {},
): Promise<void> {
  if (!configured()) return;
  try {
    const db = supabaseAdmin();
    const { data: prof } = await db.from("profiles").select("email, meta_match").eq("id", userId).maybeSingle();
    if (!prof) return;
    const match = (prof.meta_match ?? null) as MetaMatch | null;
    if (opts.requireMatch && !match) return;
    if (opts.once && match?.sent?.[name]) return;

    const user_data: Record<string, unknown> = { external_id: [sha(userId)] };
    if (prof.email) user_data.em = [sha(prof.email)];
    if (match?.fbp) user_data.fbp = match.fbp;
    if (match?.fbc) user_data.fbc = match.fbc;
    if (match?.ip) user_data.client_ip_address = match.ip;
    if (match?.ua) user_data.client_user_agent = match.ua;
    const custom_data: Record<string, unknown> = {};
    if (opts.value !== undefined) Object.assign(custom_data, { value: opts.value, currency: "AUD" });
    if (opts.plan) custom_data.content_name = opts.plan;
    if (name === "StartTrial" && opts.value) custom_data.predicted_ltv = opts.value * 3;

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";
    const body = {
      data: [
        {
          event_name: name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: opts.eventId ?? `${name}-${userId}`,
          action_source: "website",
          event_source_url: `${site}${opts.path ?? "/"}`,
          user_data,
          custom_data,
        },
      ],
      ...(process.env.META_CAPI_TEST_CODE ? { test_event_code: process.env.META_CAPI_TEST_CODE } : {}),
    };
    const res = await fetch(`https://graph.facebook.com/${VERSION}/${process.env.NEXT_PUBLIC_META_PIXEL_ID}/events?access_token=${process.env.META_CAPI_TOKEN}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[meta-capi]", name, res.status, (await res.text()).slice(0, 300));
      return;
    }
    if (opts.once) {
      const next: MetaMatch = { ...(match ?? {}), sent: { ...(match?.sent ?? {}), [name]: new Date().toISOString() } };
      await db.from("profiles").update({ meta_match: next }).eq("id", userId);
    }
  } catch (err) {
    console.error("[meta-capi]", name, err instanceof Error ? err.message : err);
  }
}
