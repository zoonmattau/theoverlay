-- Where the tipster says the price is available, and the best market price
-- we saw when they posted, so a price well above the market can be flagged.
alter table public.creator_tips add column if not exists bookie text;
alter table public.creator_tips add column if not exists market_at_post numeric(8,2);
-- When followers were emailed about it, so a burst of posts goes out as one email.
alter table public.creator_tips add column if not exists emailed_at timestamptz;
