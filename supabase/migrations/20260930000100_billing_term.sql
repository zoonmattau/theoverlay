-- How often a member is billed: month, quarter or year, from the Stripe price
-- on their subscription. Kept by the webhook; null for no subscription.
alter table profiles add column if not exists billing_term text;
