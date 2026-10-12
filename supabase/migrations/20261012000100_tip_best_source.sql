-- Who held a call's settled price and when it was seen (12 Oct 2026). A bookie code for a bet's
-- best fixed price, "betfair" for a lay's exchange price, or "jump", "sp" or "bsp" when a
-- price at or after the jump beat everything taken before it. Empty for calls before today.
alter table public.tips add column if not exists best_bookies text[];
alter table public.tips add column if not exists best_at timestamptz;
