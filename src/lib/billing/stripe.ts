import "server-only";
import Stripe from "stripe";

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

let client: Stripe | undefined;

/** One StripeClient for the server. Use a restricted key (rk_) in production. */
export function stripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-08-26.dahlia" });
  }
  return client;
}

export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** A random suffix for Stripe's integration_identifier. */
export const integrationId = (label: string) =>
  `${label}_${Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("")}`;
