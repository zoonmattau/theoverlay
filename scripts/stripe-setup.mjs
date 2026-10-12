// Creates the Overlay products and prices in Stripe, idempotently by lookup
// key, and prints the env lines to paste. Run: node scripts/stripe-setup.mjs
import Stripe from "stripe";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia" });

async function product(name, description, metadata) {
  const found = await stripe.products.search({ query: `metadata['overlay']:'${metadata.overlay}'` });
  if (found.data[0]) return found.data[0];
  return stripe.products.create({ name, description, metadata });
}

async function price(lookupKey, params) {
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({ lookup_key: lookupKey, ...params });
}

const out = {};

// Prices from 13 Oct 2026 (the user, 12 Oct): Saturday $25, Saturday + Wednesday $39,
// Every day $69 a month; quarterly 10% off, yearly 20% off; weekly $7, $12, $20.
// A Stripe price can't change, so each amount has its own lookup key ("_v2").
// Every member moved onto these at their next bill (scripts/reprice.ts).
const TERMS = [
  { id: "monthly", env: "", recurring: { interval: "month" } },
  { id: "weekly", env: "_WEEK", recurring: { interval: "week" }, nickname: "Weekly" },
  { id: "quarterly", env: "_QUARTER", recurring: { interval: "month", interval_count: 3 }, nickname: "Every 3 months" },
  { id: "yearly", env: "_YEAR", recurring: { interval: "year" }, nickname: "Yearly" },
];
for (const p of [
  { key: "SATURDAY", overlay: "saturday", name: "The Overlay: Saturday", desc: "Every Saturday meeting we cover: top four, ratings, rated prices, bet and lay calls.", amounts: { monthly: 2500, weekly: 700, quarterly: 6800, yearly: 24000 } },
  { key: "MIDWEEK", overlay: "midweek", name: "The Overlay: Saturday + Wednesday", desc: "Saturday and Wednesday metro meetings: top four, ratings, rated prices, bet and lay calls.", amounts: { monthly: 3900, weekly: 1200, quarterly: 10500, yearly: 37400 } },
  { key: "EVERYDAY", overlay: "everyday", name: "The Overlay: Every day", desc: "Every meeting we cover, every day: top four, ratings, rated prices, bet and lay calls.", amounts: { monthly: 6900, weekly: 2000, quarterly: 18600, yearly: 66200 } },
]) {
  const prod = await product(p.name, p.desc, { overlay: p.overlay });
  for (const t of TERMS) {
    const pr = await price(`overlay_${p.overlay}_${t.id}_v2`, {
      product: prod.id,
      currency: "aud",
      unit_amount: p.amounts[t.id],
      recurring: t.recurring,
      ...(t.nickname ? { nickname: t.nickname } : {}),
      tax_behavior: "exclusive",
    });
    out[`STRIPE_PRICE_${p.key}${t.env}`] = pr.id;
    console.log(p.name, t.id, pr.id, `$${p.amounts[t.id] / 100}`);
  }
}

const pass = await product(
  "The Overlay: Day Pass",
  "Opens every tip, rating and rated price for one racing day of your choice. Cheaper in a bundle.",
  { overlay: "daypass" },
);
for (const b of [
  { qty: 1, amount: 1000 },
  { qty: 3, amount: 2700 },
  { qty: 5, amount: 4000 },
  { qty: 10, amount: 7000 },
]) {
  const pr = await price(`overlay_day_pass_${b.qty}`, {
    product: pass.id,
    currency: "aud",
    unit_amount: b.amount,
    nickname: `${b.qty} day pass${b.qty === 1 ? "" : "es"}`,
    tax_behavior: "exclusive",
  });
  out[`STRIPE_PRICE_PASS_${b.qty}`] = pr.id;
  console.log(`Day Pass x${b.qty}`, pr.id);
}

console.log("\nENV\n" + Object.entries(out).map(([k, v]) => `${k}=${v}`).join("\n"));
