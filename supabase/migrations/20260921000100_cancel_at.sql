-- A cancellation booked for the end of the period. Stripe now records it in
-- the subscription's cancel_at (cancel_at_period_end stays false on a trial),
-- and the webhook missed four of six trial cancellations that way by
-- 21 Sep 2026. cancel_reason is the feedback the portal collected.
alter table profiles add column if not exists cancel_at timestamptz;
alter table profiles add column if not exists cancel_reason text;
