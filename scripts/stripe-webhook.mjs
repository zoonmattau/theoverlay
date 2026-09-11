// Creates (or finds) the production webhook endpoint and prints its secret once.
import Stripe from "stripe";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia" });
const url = "https://theoverlay.com.au/api/stripe/webhook";
const existing = (await stripe.webhookEndpoints.list({ limit: 100 })).data.find((w) => w.url === url);
if (existing) { console.log("exists", existing.id, "(secret only shown at creation; delete it in the dashboard to recreate)"); process.exit(0); }
const ep = await stripe.webhookEndpoints.create({
  url,
  enabled_events: [
    "checkout.session.completed", "checkout.session.async_payment_succeeded",
    "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
    "invoice.paid", "invoice.payment_failed",
  ],
  description: "The Overlay production",
});
console.log("SECRET=" + ep.secret);
